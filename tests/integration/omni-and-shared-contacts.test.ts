import { gzipSync } from "node:zlib";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { processWebhookEvent } from "../../src/application/inbound-processor.js";
import { registerOmniAccount } from "../../src/application/omni-setup.js";
import { sendDraftSummary } from "../../src/application/property-intake.js";
import { receiveWebhook } from "../../src/application/webhook-intake.js";
import { optOutByPhone } from "../../src/application/consent-service.js";
import { buildServer } from "../../src/http/server.js";
import { OmniInboundAdapter } from "../../src/infra/omni/omni-inbound.js";
import { signOmniWebhook } from "../../src/infra/omni/omni-signature.js";
import { createContact, createTenant, db, makeDeps, PROPERTY_TEXT, resetDb, zapiMessage, type TestDeps } from "../helpers.js";

let deps: TestDeps;
beforeEach(async () => {
  await resetDb();
  deps = makeDeps();
  deps.inbound.omni = new OmniInboundAdapter();
});
afterAll(() => db.$disconnect());

async function deliver(token: string, payload: unknown) {
  const r = await receiveWebhook(deps, "zapi", token, payload);
  if (r.status === "accepted") await processWebhookEvent(deps, r.webhookEventId, { attempt: 1, maxAttempts: 1 });
  return r;
}
async function flushSummaries() {
  for (const job of deps.queue.summaries.values()) await sendDraftSummary(deps, job);
  deps.queue.summaries.clear();
}
const replies = () => deps.fake.sent.flatMap((s) => (s.content.kind === "text" ? [s.content.text] : []));

describe("contatos compartilhados pelo corretor viram o público da campanha", () => {
  it("cria os contatos com consentimento atestado e mira só neles", async () => {
    const t = await createTenant();
    await createContact(t.tenant.id, { name: "Carteira Antiga" }); // compatível, mas fora da lista
    const ref = t.account.accountReference;

    await deliver(t.webhookToken, zapiMessage(ref, { text: PROPERTY_TEXT }));
    await deliver(
      t.webhookToken,
      zapiMessage(ref, { contacts: [{ name: "Ana Souza", phone: "5545998382060" }, { name: "Bruno Lima", phone: "5511987654321" }] }),
    );
    await flushSummaries();
    expect(replies().at(-1)).toContain("2 contato(s)* enviados por você: Ana Souza, Bruno Lima");

    const ana = await db.contact.findFirstOrThrow({ where: { tenantId: t.tenant.id, phoneE164: "+5545998382060" }, include: { consents: true } });
    expect(ana.source).toBe("corretor_whatsapp");
    expect(ana.consents[0]).toMatchObject({ source: "corretor_whatsapp", evidenceReference: expect.stringMatching(/^whatsapp:/) });
    expect(await db.auditLog.count({ where: { tenantId: t.tenant.id, action: "campaign.contacts_shared" } })).toBe(1);

    await deliver(t.webhookToken, zapiMessage(ref, { text: "CONFIRMAR" }));
    const recipients = await db.campaignRecipient.findMany({ where: { tenantId: t.tenant.id }, include: { contact: true } });
    expect(recipients.map((r) => r.contact.name).sort()).toEqual(["Ana Souza", "Bruno Lima"]);
  });

  it("quem pediu para sair nunca entra, mesmo compartilhado; número sem 9º dígito casa com o cadastrado", async () => {
    const t = await createTenant();
    const ref = t.account.accountReference;
    await createContact(t.tenant.id, { name: "Já Cadastrada", phone: "+5511987654321" });
    await optOutByPhone(db, t.tenant.id, "+5545998382060", { source: "test" }, { type: "system" });

    await deliver(t.webhookToken, zapiMessage(ref, { text: PROPERTY_TEXT }));
    await deliver(
      t.webhookToken,
      zapiMessage(ref, { contacts: [{ name: "Saiu", phone: "5545998382060" }, { name: "Mesmo número", phone: "551187654321" }] }),
    );
    expect(replies().some((r) => r.includes("Não entram (pediram para não receber ofertas): Saiu"))).toBe(true);
    const campaign = await db.campaign.findFirstOrThrow({ where: { tenantId: t.tenant.id } });
    expect(campaign.eligibleCount).toBe(1);
    expect(await db.contact.count({ where: { tenantId: t.tenant.id, phoneE164: "+551187654321" } })).toBe(0); // reaproveitou
  });
});

describe("Omni Z-API", () => {
  async function omniTenant() {
    const t = await createTenant();
    let created: Record<string, unknown> | null = null;
    deps.omni = {
      baseUrl: "https://api.omni.test",
      timeoutMs: 5000,
      fetchImpl: (async (_url: string, init: RequestInit) => {
        created = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ id: "WH1", secret: "e".repeat(64) }), { status: 201 });
      }) as unknown as typeof fetch,
    };
    const { account, webhookUrl } = await registerOmniAccount(
      deps,
      t.tenant.id,
      { channelId: "01A1824DEEE37BCA8C3257417A26EE7F", secretKey: "sk_live_x", inboundMode: "direct" },
      { type: "user", id: t.user.id },
    );
    return { ...t, account, token: webhookUrl.split("/").at(-1)!, created: created! };
  }

  it("cadastro cria o webhook na Omni e guarda as chaves cifradas", async () => {
    const t = await omniTenant();
    expect(t.created).toMatchObject({ url: `http://test/webhooks/omni/${t.token}`, signing: true, payloadFormat: "Z_API" });
    const s = await deps.secrets.get(t.tenant.id, t.account.configurationRef!);
    expect(s).toEqual({ secretKey: "sk_live_x", webhookId: "WH1", webhookSecret: "e".repeat(64) });
  });

  it("webhook assinado e comprimido (gzip) passa; sem assinatura é recusado", async () => {
    const t = await omniTenant();
    const app: FastifyInstance = await buildServer(deps, { jwtSecret: "x".repeat(40) });
    const payload = zapiMessage("qualquer", { group: false, text: PROPERTY_TEXT + " ".repeat(1200) });
    const raw = Buffer.from(JSON.stringify(payload));
    const now = Math.floor(Date.now() / 1000);

    const ok = await app.inject({
      method: "POST",
      url: `/webhooks/omni/${t.token}`,
      headers: { "content-type": "application/json", "content-encoding": "gzip", ...signOmniWebhook(raw, "e".repeat(64), now) },
      payload: gzipSync(raw),
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ status: "accepted" });
    const ev = await db.webhookEvent.findFirstOrThrow({ where: { tenantId: t.tenant.id } });
    expect(ev.providerAccountId).toBe(t.account.id);
    // O corretor (telefone cadastrado) recebe o rascunho mesmo com instanceId estranho no payload.
    expect(await processWebhookEvent(deps, ev.id, { attempt: 1, maxAttempts: 1 })).toBe("agent:draft_updated");

    const unsigned = await app.inject({
      method: "POST",
      url: `/webhooks/omni/${t.token}`,
      headers: { "content-type": "application/json" },
      payload: JSON.stringify(zapiMessage("x", { group: false, text: "oi" })),
    });
    expect(unsigned.statusCode).toBe(401);
    await app.close();
  });
});
