import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cancelCampaign, confirmCampaign, createCampaign, pauseCampaign, resumeCampaign } from "../../src/application/campaign-service.js";
import { optOutByPhone } from "../../src/application/consent-service.js";
import { processWebhookEvent } from "../../src/application/inbound-processor.js";
import { reconcile } from "../../src/application/reconcile.js";
import { processRecipient, RetryableSendError, SendDeferredError, type SendPacing } from "../../src/application/send-recipient.js";
import { receiveWebhook } from "../../src/application/webhook-intake.js";
import { ProviderError } from "../../src/ports/outbound.js";
import { createContact, createTenant, db, makeDeps, PDF, PNG, resetDb, zapiStatus, type TestDeps } from "../helpers.js";

let deps: TestDeps;
beforeEach(async () => {
  await resetDb();
  deps = makeDeps();
});
afterAll(() => db.$disconnect());

const user = (id: string) => ({ type: "user" as const, id });

async function setup(contacts: { phone?: string; consent?: boolean }[] = [{}, {}], withAssets = false) {
  const t = await createTenant();
  const cs = [];
  for (const c of contacts) cs.push(await createContact(t.tenant.id, c));
  const property = await db.property.create({
    data: { tenantId: t.tenant.id, title: "Apto Centro", description: "Apto 3 quartos R$ 450.000", price: 450000, propertyType: "apartamento" },
  });
  if (withAssets) {
    for (const [i, [buf, kind, mime]] of ([[PNG, "image", "image/png"], [PDF, "document", "application/pdf"]] as const).entries()) {
      const key = `tenants/${t.tenant.id}/p/${i}`;
      await deps.storage.put(key, buf, mime);
      await db.propertyAsset.create({
        data: { tenantId: t.tenant.id, propertyId: property.id, kind, storageKey: key, mimeType: mime, sizeBytes: buf.length, sha256: "x", position: i, originalName: kind === "document" ? "Ficha.pdf" : null },
      });
    }
  }
  const campaign = await createCampaign(deps, t.tenant.id, { propertyId: property.id }, user(t.user.id));
  return { ...t, contacts: cs, property, campaign };
}

/** Executa a fila em memória como o worker faria (com retries). */
async function runQueue(maxAttempts = 3) {
  const outcomes: string[] = [];
  for (const job of deps.queue.drainSends()) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        outcomes.push(await processRecipient(deps, { ...job, attempt, maxAttempts }));
        break;
      } catch (err) {
        if (!(err instanceof RetryableSendError) || attempt === maxAttempts) throw err;
      }
    }
  }
  return outcomes;
}

describe("confirmação e público", () => {
  it("público elegível exclui sem consentimento e descadastrados", async () => {
    const s = await setup([{}, { consent: false }, { phone: "+5511955554444" }]);
    await optOutByPhone(db, s.tenant.id, "+5511955554444", { source: "test" }, { type: "system" });
    const r = await confirmCampaign(deps, s.tenant.id, s.campaign.id, user(s.user.id));
    expect(r.recipients).toBe(1);
    expect(await db.campaignRecipient.count({ where: { campaignId: s.campaign.id } })).toBe(1);
  });

  it("confirmação dupla (sequencial e concorrente) não duplica destinatários nem tarefas", async () => {
    const s = await setup([{}, {}, {}]);
    const results = await Promise.all([1, 2, 3].map(() => confirmCampaign(deps, s.tenant.id, s.campaign.id, user(s.user.id))));
    expect(results.filter((r) => !r.alreadyConfirmed)).toHaveLength(1);
    const again = await confirmCampaign(deps, s.tenant.id, s.campaign.id, user(s.user.id));
    expect(again.alreadyConfirmed).toBe(true);
    expect(await db.campaignRecipient.count({ where: { campaignId: s.campaign.id } })).toBe(3);
    expect(deps.queue.sends.size).toBe(3);
  });

  it("respeita o limite mensal do plano", async () => {
    const s = await setup([{}, {}, {}]);
    await db.tenant.update({ where: { id: s.tenant.id }, data: { monthlyMessageLimit: 2 } });
    await expect(confirmCampaign(deps, s.tenant.id, s.campaign.id, user(s.user.id))).rejects.toMatchObject({ code: "plan_limit_exceeded" });
    expect((await db.campaign.findUniqueOrThrow({ where: { id: s.campaign.id } })).status).toBe("awaiting_confirmation");
  });
});

describe("worker de envio", () => {
  it("envia imagem+texto e PDF por destinatário e conclui a campanha", async () => {
    const s = await setup([{}, {}], true);
    await confirmCampaign(deps, s.tenant.id, s.campaign.id, user(s.user.id));
    expect(await runQueue()).toEqual(["sent", "sent"]);
    expect(deps.fake.sent).toHaveLength(4);
    expect(deps.fake.sent[0]!.content).toMatchObject({ kind: "image", caption: expect.stringContaining("Olá, Maria!") });
    expect(deps.fake.sent[1]!.content).toMatchObject({ kind: "document", extension: "pdf", fileName: "Ficha" });
    const c = await db.campaign.findUniqueOrThrow({ where: { id: s.campaign.id } });
    expect(c.status).toBe("completed");
    expect(await db.campaignRecipient.count({ where: { campaignId: c.id, status: "accepted" } })).toBe(2);
  });

  it("ritmo do número: adiamento não altera nada; descadastrado não consome vaga; pausa entre partes", async () => {
    const s = await setup([{}, { phone: "+5511955554444" }], true);
    await confirmCampaign(deps, s.tenant.id, s.campaign.id, user(s.user.id));
    const [a, b] = deps.queue.drainSends();
    const calls: string[] = [];
    const deferring: SendPacing = {
      beforeRecipient: async (accountId) => {
        calls.push(`turn:${accountId}`);
        throw new SendDeferredError(Date.now() + 60_000, "window");
      },
      betweenParts: async () => void calls.push("part"),
    };
    await expect(processRecipient(deps, { ...a!, attempt: 1, maxAttempts: 3, pacing: deferring })).rejects.toBeInstanceOf(SendDeferredError);
    expect(deps.fake.sent).toHaveLength(0);
    expect(await db.campaignRecipient.count({ where: { campaignId: s.campaign.id, status: "queued", attemptCount: 0 } })).toBe(2);

    await optOutByPhone(db, s.tenant.id, "+5511955554444", { source: "test" }, { type: "system" });
    calls.length = 0;
    const pacing: SendPacing = { beforeRecipient: async (id) => void calls.push(`turn:${id}`), betweenParts: async () => void calls.push("part") };
    const outcomes = [];
    for (const job of [a!, b!]) outcomes.push(await processRecipient(deps, { ...job, attempt: 1, maxAttempts: 3, pacing }));
    expect(outcomes.sort()).toEqual(["sent", "skipped_settled"]); // o descadastro já cancelou o pendente
    expect(calls).toEqual([`turn:${s.account.id}`, "part"]); // só quem recebeu esperou a vez; PDF após pausa curta
    expect(deps.fake.sent).toHaveLength(2);
  });

  it("timeout do provedor → unknown, sem reenvio automático", async () => {
    const s = await setup([{ phone: "+5511900000002" }]);
    await confirmCampaign(deps, s.tenant.id, s.campaign.id, user(s.user.id));
    const [job] = deps.queue.drainSends();
    expect(await processRecipient(deps, { ...job!, attempt: 1, maxAttempts: 3 })).toBe("unknown");
    // Mesmo que a tarefa rode de novo (ex.: reconciliação), não reenvia
    expect(await processRecipient(deps, { ...job!, attempt: 2, maxAttempts: 3 })).toBe("skipped_settled");
    const r = await db.campaignRecipient.findFirstOrThrow({ where: { campaignId: s.campaign.id } });
    expect(r.status).toBe("unknown");
  });

  it("limite de requisições → retry com backoff e envio único", async () => {
    const s = await setup([{ phone: "+5511900000004" }]);
    await confirmCampaign(deps, s.tenant.id, s.campaign.id, user(s.user.id));
    const [job] = deps.queue.drainSends();
    await expect(processRecipient(deps, { ...job!, attempt: 1, maxAttempts: 3 })).rejects.toBeInstanceOf(RetryableSendError);
    expect(await processRecipient(deps, { ...job!, attempt: 2, maxAttempts: 3 })).toBe("sent");
    expect(deps.fake.sent).toHaveLength(1);
    expect((await db.campaignRecipient.findFirstOrThrow({ where: { campaignId: s.campaign.id } })).attemptCount).toBe(2);
  });

  it("erro transitório esgotando tentativas → failed (não perde silenciosamente)", async () => {
    const s = await setup([{}]);
    await confirmCampaign(deps, s.tenant.id, s.campaign.id, user(s.user.id));
    const [job] = deps.queue.drainSends();
    for (let attempt = 1; attempt <= 3; attempt++) {
      deps.fake.nextError = new ProviderError("transient", "http_503", "fora");
      const p = processRecipient(deps, { ...job!, attempt, maxAttempts: 3 });
      if (attempt < 3) await expect(p).rejects.toBeInstanceOf(RetryableSendError);
      else expect(await p).toBe("failed_exhausted");
    }
    const r = await db.campaignRecipient.findFirstOrThrow({ where: { campaignId: s.campaign.id } });
    expect(r).toMatchObject({ status: "failed", errorCode: "retries_exhausted" });
  });

  it("falha permanente de um destinatário não interrompe os demais", async () => {
    const s = await setup([{ phone: "+5511900000001" }, {}]);
    await confirmCampaign(deps, s.tenant.id, s.campaign.id, user(s.user.id));
    expect((await runQueue()).sort()).toEqual(["failed_permanent", "sent"]);
    const failed = await db.campaignRecipient.findFirstOrThrow({ where: { campaignId: s.campaign.id, status: "failed" } });
    expect(failed.errorCode).toBe("invalid_number");
    expect((await db.campaign.findUniqueOrThrow({ where: { id: s.campaign.id } })).status).toBe("completed");
  });

  it("worker interrompido no meio da chamada → unknown; antes da chamada → retoma e envia uma vez", async () => {
    const s = await setup([{}, {}], true);
    await confirmCampaign(deps, s.tenant.id, s.campaign.id, user(s.user.id));
    const [a, b] = deps.queue.drainSends();

    // Caso A: imagem aceita, PDF ficou "processing" (processo morreu durante o envio do PDF)
    await db.campaignRecipient.update({ where: { id: a!.recipientId }, data: { status: "processing" } });
    await db.recipientMessage.createMany({
      data: [
        { tenantId: s.tenant.id, recipientId: a!.recipientId, part: 0, kind: "image", status: "accepted", providerMessageId: "old-1" },
        { tenantId: s.tenant.id, recipientId: a!.recipientId, part: 1, kind: "document", status: "processing" },
      ],
    });
    // Caso B: processo morreu logo após marcar o destinatário, antes de chamar o provedor
    await db.campaignRecipient.update({ where: { id: b!.recipientId }, data: { status: "processing" } });

    // Reconciliação re-enfileira os órfãos
    await db.$executeRaw`UPDATE campaign_recipients SET updated_at = now() - interval '10 minutes'`;
    await reconcile(deps);
    expect(deps.queue.sends.size).toBe(2);
    await runQueue();

    const ra = await db.campaignRecipient.findUniqueOrThrow({ where: { id: a!.recipientId } });
    const rb = await db.campaignRecipient.findUniqueOrThrow({ where: { id: b!.recipientId } });
    expect(ra.status).toBe("unknown");
    expect(rb.status).toBe("accepted");
    expect(deps.fake.sent).toHaveLength(2); // só as 2 partes de B; nada reenviado para A
    expect(deps.fake.sent.every((m) => m.to === rb.phoneE164)).toBe(true);
  });

  it("revogação de consentimento durante a campanha impede o envio", async () => {
    const s = await setup([{}, {}]);
    await confirmCampaign(deps, s.tenant.id, s.campaign.id, user(s.user.id));
    await optOutByPhone(db, s.tenant.id, s.contacts[0]!.phoneE164, { source: "whatsapp:SAIR" }, { type: "contact" });
    await runQueue();
    expect(deps.fake.sent.map((m) => m.to)).toEqual([s.contacts[1]!.phoneE164]);
    const r0 = await db.campaignRecipient.findFirstOrThrow({ where: { contactId: s.contacts[0]!.id } });
    expect(r0).toMatchObject({ status: "cancelled", errorCode: "consent_revoked" });
    // descadastro atribuído à campanha
    expect((await db.suppressionEntry.findFirstOrThrow({ where: { tenantId: s.tenant.id } })).campaignId).toBe(s.campaign.id);
  });

  it("pausa segura os envios; retomada continua; cancelamento descarta o restante", async () => {
    const s = await setup([{}, {}, {}]);
    await confirmCampaign(deps, s.tenant.id, s.campaign.id, user(s.user.id));
    await pauseCampaign(deps, s.tenant.id, s.campaign.id, user(s.user.id));
    expect(await runQueue()).toEqual(["skipped_campaign_paused", "skipped_campaign_paused", "skipped_campaign_paused"]);
    expect(deps.fake.sent).toHaveLength(0);

    await resumeCampaign(deps, s.tenant.id, s.campaign.id, user(s.user.id));
    const [first] = deps.queue.drainSends();
    await processRecipient(deps, { ...first!, attempt: 1, maxAttempts: 3 });
    await cancelCampaign(deps, s.tenant.id, s.campaign.id, user(s.user.id));
    await runQueue();
    expect(deps.fake.sent).toHaveLength(1);
    expect(await db.campaignRecipient.count({ where: { campaignId: s.campaign.id, status: "cancelled" } })).toBe(2);
    await expect(resumeCampaign(deps, s.tenant.id, s.campaign.id, user(s.user.id))).rejects.toMatchObject({ code: "invalid_transition" });
  });

  it("conta desconectada pausa a campanha em vez de insistir", async () => {
    const s = await setup([{ phone: "+5511900000005" }, {}]);
    await confirmCampaign(deps, s.tenant.id, s.campaign.id, user(s.user.id));
    await runQueue();
    const c = await db.campaign.findUniqueOrThrow({ where: { id: s.campaign.id } });
    expect(c.status).toBe("paused");
    expect(c.statusReason).toContain("instance_disconnected");
  });
});

describe("status de entrega", () => {
  it("eventos fora de ordem não regridem; status duplicado é ignorado", async () => {
    const s = await setup([{}]);
    await confirmCampaign(deps, s.tenant.id, s.campaign.id, user(s.user.id));
    await runQueue();
    const msgId = deps.fake.sent[0]!.providerMessageId;
    const inst = s.account.accountReference;

    for (const st of ["READ", "RECEIVED", "SENT", "READ"]) {
      const r = await receiveWebhook(deps, "zapi", s.webhookToken, zapiStatus(inst, [msgId], st));
      if (r.status === "accepted") await processWebhookEvent(deps, r.webhookEventId, { attempt: 1, maxAttempts: 1 });
    }
    const r = await db.campaignRecipient.findFirstOrThrow({ where: { campaignId: s.campaign.id } });
    expect(r.status).toBe("read");
    expect(r.readAt).not.toBeNull();
    expect(r.deliveredAt).not.toBeNull();
    expect(await db.webhookEvent.count({ where: { eventType: "status" } })).toBe(3); // o 2º READ foi deduplicado
  });

  it("status que chega antes do messageId ser gravado é reprocessado depois", async () => {
    const s = await setup([{}]);
    const r = await receiveWebhook(deps, "zapi", s.webhookToken, zapiStatus(s.account.accountReference, ["ainda-nao-existe"], "SENT"));
    if (r.status !== "accepted") throw new Error("esperado accepted");
    await expect(processWebhookEvent(deps, r.webhookEventId, { attempt: 1, maxAttempts: 3 })).rejects.toThrow(/sem mensagem/);
    expect(await processWebhookEvent(deps, r.webhookEventId, { attempt: 3, maxAttempts: 3 })).toBe("no_matching_message");
  });
});
