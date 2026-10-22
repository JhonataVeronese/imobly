import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { processWebhookEvent } from "../../src/application/inbound-processor.js";
import { sendDraftSummary } from "../../src/application/property-intake.js";
import { receiveWebhook } from "../../src/application/webhook-intake.js";
import {
  AGENT_PHONE,
  createContact,
  createTenant,
  db,
  makeDeps,
  PDF,
  PNG,
  PROPERTY_TEXT,
  resetDb,
  zapiMessage,
  type TestDeps,
} from "../helpers.js";

let deps: TestDeps;
beforeEach(async () => {
  await resetDb();
  deps = makeDeps();
});
afterAll(() => db.$disconnect());

/** Simula o caminho completo: webhook HTTP (síncrono) + worker de entrada (assíncrono). */
async function deliver(token: string, payload: unknown) {
  const r = await receiveWebhook(deps, "zapi", token, payload);
  if (r.status === "accepted") {
    const note = await processWebhookEvent(deps, r.webhookEventId, { attempt: 1, maxAttempts: 1 });
    return { ...r, note };
  }
  return r;
}

/** Executa os resumos agendados (o debounce do BullMQ, em produção). */
async function flushSummaries() {
  for (const job of deps.queue.summaries.values()) await sendDraftSummary(deps, job);
  deps.queue.summaries.clear();
}

const lastReply = () => {
  const t = deps.fake.sent.at(-1)?.content;
  return t?.kind === "text" ? t.text : "";
};

describe("entrada de imóveis pelo WhatsApp", () => {
  it("texto + foto + PDF no grupo criam rascunho e campanha aguardando confirmação", async () => {
    const t = await createTenant();
    await createContact(t.tenant.id, { preferences: { propertyTypes: ["apartamento"] } });
    await createContact(t.tenant.id, { preferences: { propertyTypes: ["casa"] } }); // incompatível
    await createContact(t.tenant.id, { consent: false }); // sem consentimento
    deps.media.set("https://zapi/img.png", PNG);
    deps.media.set("https://zapi/ficha.pdf", PDF);

    // Mídia chega antes do texto (a Z-API não garante ordem)
    await deliver(t.webhookToken, zapiMessage(t.account.accountReference, { image: "https://zapi/img.png" }));
    const r = await deliver(t.webhookToken, zapiMessage(t.account.accountReference, { text: PROPERTY_TEXT }));
    await deliver(t.webhookToken, zapiMessage(t.account.accountReference, { document: { url: "https://zapi/ficha.pdf" } }));
    expect(deps.fake.sent).toHaveLength(0); // nenhuma resposta por mensagem: só o resumo no fim da rajada
    await flushSummaries();
    expect(deps.fake.sent).toHaveLength(1);

    expect(r).toMatchObject({ note: "agent:draft_updated" });
    const props = await db.property.findMany({ where: { tenantId: t.tenant.id }, include: { assets: true } });
    expect(props).toHaveLength(1);
    expect(props[0]).toMatchObject({ propertyType: "apartamento", bedrooms: 3, parkingSpaces: 2, neighborhood: "Centro", status: "draft" });
    expect(Number(props[0]!.price)).toBe(450000);
    expect(props[0]!.city).toBeNull(); // não informado → nulo
    expect(props[0]!.assets.map((a) => a.kind).sort()).toEqual(["document", "image"]);
    // Arquivos copiados para o nosso storage (não dependemos da URL temporária)
    expect(deps.storage.objects.size).toBe(2);

    const campaigns = await db.campaign.findMany({ where: { tenantId: t.tenant.id } });
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0]).toMatchObject({ status: "awaiting_confirmation", eligibleCount: 1 });
    const summary = deps.fake.sent.map((s) => (s.content.kind === "text" ? s.content.text : "")).find((x) => x.includes("Imóvel recebido"));
    expect(summary).toContain("R$ 450.000");
    expect(summary).toContain("1 contatos elegíveis");
    expect(summary).toContain("CONFIRMAR");
    expect(summary).toContain("1 foto(s), 1 PDF(s)");
    // Nenhum envio de campanha antes da confirmação explícita
    expect(deps.queue.sends.size).toBe(0);
  });

  it("anúncio real: texto + 9 fotos geram um único resumo com as duas plantas", async () => {
    const t = await createTenant();
    await createContact(t.tenant.id, { preferences: { bedroomsMin: 2, priceMax: 400_000 } });
    await createContact(t.tenant.id, { preferences: { propertyTypes: ["casa"] } });
    const text = readFileSync(new URL("../fixtures/anuncio-balla-citta.txt", import.meta.url), "utf8");
    await deliver(t.webhookToken, zapiMessage(t.account.accountReference, { text }));
    for (let i = 0; i < 9; i++) {
      deps.media.set(`https://zapi/foto-${i}.png`, PNG);
      await deliver(t.webhookToken, zapiMessage(t.account.accountReference, { image: `https://zapi/foto-${i}.png` }));
    }
    await flushSummaries();
    expect(deps.fake.sent).toHaveLength(1);
    const reply = lastReply();
    expect(reply).toContain("BALLA CITTÁ");
    expect(reply).toContain("a partir de R$ 370.000");
    expect(reply).toContain("• 1 dorm · 1 suíte · 55 m² · R$ 370.000");
    expect(reply).toContain("• 2 dorm · 1 suíte · 65 m² · R$ 385.000");
    expect(reply).toContain("9 foto(s)");
    expect(reply).toContain("1 contatos elegíveis"); // quem busca 2 quartos entra; quem quer casa, não
  });

  it("CONFIRMAR inicia a campanha; CONFIRMAR repetido não duplica", async () => {
    const t = await createTenant();
    await createContact(t.tenant.id);
    await createContact(t.tenant.id);
    await deliver(t.webhookToken, zapiMessage(t.account.accountReference, { text: PROPERTY_TEXT }));
    await deliver(t.webhookToken, zapiMessage(t.account.accountReference, { text: "CONFIRMAR" }));
    expect(lastReply()).toContain("na fila para 2 contatos");
    await deliver(t.webhookToken, zapiMessage(t.account.accountReference, { text: "confirmar" }));
    expect(lastReply()).toContain("Não há campanha aguardando");

    const c = await db.campaign.findFirstOrThrow({ where: { tenantId: t.tenant.id } });
    expect(c.status).toBe("processing");
    expect(await db.campaignRecipient.count({ where: { campaignId: c.id } })).toBe(2);
    expect(deps.queue.sends.size).toBe(2);
    expect([...deps.queue.sends.values()].every((j) => j.providerAccountId === t.account.id)).toBe(true);
  });

  it("PAUSAR e RETOMAR pelo WhatsApp; AJUDA lista os comandos", async () => {
    const t = await createTenant();
    await createContact(t.tenant.id);
    await deliver(t.webhookToken, zapiMessage(t.account.accountReference, { text: PROPERTY_TEXT }));
    await deliver(t.webhookToken, zapiMessage(t.account.accountReference, { text: "CONFIRMAR" }));
    deps.queue.drainSends();

    await deliver(t.webhookToken, zapiMessage(t.account.accountReference, { text: "PAUSAR" }));
    expect(lastReply()).toContain("pausada");
    const paused = await db.campaign.findFirstOrThrow({ where: { tenantId: t.tenant.id } });
    expect(paused.status).toBe("paused");

    await deliver(t.webhookToken, zapiMessage(t.account.accountReference, { text: "STATUS" }));
    expect(lastReply()).toContain("RETOMAR");

    await deliver(t.webhookToken, zapiMessage(t.account.accountReference, { text: "retomar" }));
    expect(lastReply()).toContain("retomada: 1 contato(s) na fila");
    expect((await db.campaign.findFirstOrThrow({ where: { id: paused.id } })).status).toBe("processing");
    expect(deps.queue.sends.size).toBe(1); // reenfileirado ao retomar

    await deliver(t.webhookToken, zapiMessage(t.account.accountReference, { text: "ajuda" }));
    for (const cmd of ["CONFIRMAR", "CANCELAR", "STATUS", "PAUSAR", "RETOMAR"]) expect(lastReply()).toContain(cmd);
  });

  it("CANCELAR descarta o rascunho sem enviar nada", async () => {
    const t = await createTenant();
    await createContact(t.tenant.id);
    await deliver(t.webhookToken, zapiMessage(t.account.accountReference, { text: PROPERTY_TEXT }));
    await deliver(t.webhookToken, zapiMessage(t.account.accountReference, { text: "CANCELAR" }));
    const c = await db.campaign.findFirstOrThrow({ where: { tenantId: t.tenant.id } });
    expect(c.status).toBe("cancelled");
    expect(await db.campaignRecipient.count()).toBe(0);
  });

  it("webhook duplicado é processado uma única vez", async () => {
    const t = await createTenant();
    const payload = zapiMessage(t.account.accountReference, { text: PROPERTY_TEXT, messageId: "DUP-1" });
    const a = await deliver(t.webhookToken, payload);
    const b = await deliver(t.webhookToken, payload);
    expect(a.status).toBe("accepted");
    expect(b.status).toBe("duplicate");
    expect(await db.webhookEvent.count()).toBe(1);
    expect(await db.property.count()).toBe(1);
  });

  it("webhook inválido, token errado e instância divergente são rejeitados", async () => {
    const t = await createTenant();
    await expect(receiveWebhook(deps, "zapi", t.webhookToken, { nada: true })).rejects.toMatchObject({ httpStatus: 400 });
    await expect(receiveWebhook(deps, "zapi", "token-forjado", zapiMessage(t.account.accountReference, { text: "x" }))).rejects.toMatchObject({
      httpStatus: 401,
    });
    await expect(receiveWebhook(deps, "zapi", t.webhookToken, zapiMessage("OUTRA-INSTANCIA", { text: "x" }))).rejects.toMatchObject({
      httpStatus: 401,
    });
    await expect(receiveWebhook(deps, "outro", t.webhookToken, {})).rejects.toMatchObject({ httpStatus: 404 });
    expect(await db.webhookEvent.count()).toBe(0);
  });

  it("remetente não autorizado no grupo é ignorado e auditado", async () => {
    const t = await createTenant();
    const r = await deliver(t.webhookToken, zapiMessage(t.account.accountReference, { text: PROPERTY_TEXT, from: "+5521977776666" }));
    expect(r).toMatchObject({ note: "ignored:unauthorized_sender" });
    expect(await db.property.count()).toBe(0);
    expect(await db.auditLog.count({ where: { action: "inbound.unauthorized_sender" } })).toBe(1);
  });

  it("mensagem de outro grupo (fora do canal configurado) é ignorada", async () => {
    const t = await createTenant();
    const r = await deliver(t.webhookToken, zapiMessage(t.account.accountReference, { text: PROPERTY_TEXT, chatId: "999-group" }));
    expect(r).toMatchObject({ note: "ignored:group_not_configured" });
    expect(await db.property.count()).toBe(0);
  });

  it("mensagens enviadas pelo próprio número (fromMe) não geram loop", async () => {
    const t = await createTenant();
    const r = await deliver(t.webhookToken, zapiMessage(t.account.accountReference, { text: PROPERTY_TEXT, fromMe: true }));
    expect(r).toMatchObject({ note: "ignored:from_me" });
  });

  it("PDF inválido/indisponível e arquivo acima do limite são rejeitados com aviso", async () => {
    const t = await createTenant();
    deps.media.set("https://zapi/fake.pdf", Buffer.from("isto não é um pdf"));
    deps.media.set("https://zapi/big.png", Buffer.concat([PNG, Buffer.alloc(5000)]));
    await deliver(t.webhookToken, zapiMessage(t.account.accountReference, { text: PROPERTY_TEXT }));
    await deliver(t.webhookToken, zapiMessage(t.account.accountReference, { document: { url: "https://zapi/fake.pdf", fileName: "fake.pdf" } }));
    expect(lastReply()).toMatch(/rejeitado[\s\S]*Formato não suportado/);
    await deliver(t.webhookToken, zapiMessage(t.account.accountReference, { document: { url: "https://zapi/sumiu.pdf", fileName: "sumiu.pdf" } }));
    expect(lastReply()).toMatch(/indisponível/);
    await deliver(t.webhookToken, zapiMessage(t.account.accountReference, { image: "https://zapi/big.png" }));
    expect(lastReply()).toMatch(/limite/);
    expect(await db.propertyAsset.count()).toBe(0);
  });

  it("modo direto: corretor manda no privado; telefone sem o 9º dígito é reconhecido", async () => {
    const t = await createTenant("Direto", { inboundMode: "direct" });
    const no9 = AGENT_PHONE.replace("+55119", "+5511");
    const r = await deliver(t.webhookToken, zapiMessage(t.account.accountReference, { text: PROPERTY_TEXT, group: false, from: no9 }));
    expect(r).toMatchObject({ note: "agent:draft_updated" });
  });
});

describe("descadastro pelo WhatsApp", () => {
  it("SAIR revoga consentimento, entra na supressão e não reativa por importação", async () => {
    const t = await createTenant();
    const c = await createContact(t.tenant.id, { phone: "+5511912345678" });
    const r = await deliver(
      t.webhookToken,
      zapiMessage(t.account.accountReference, { text: "Sair", group: false, from: "5511912345678" }),
    );
    expect(r).toMatchObject({ note: "opt_out" });
    const after = await db.contact.findUniqueOrThrow({ where: { id: c.id }, include: { consents: true } });
    expect(after.status).toBe("opted_out");
    expect(after.consents.every((x) => x.revokedAt)).toBe(true);
    expect(await db.suppressionEntry.count({ where: { tenantId: t.tenant.id, phoneE164: c.phoneE164 } })).toBe(1);
    expect(lastReply()).toContain("não receberá mais ofertas");

    const { importContactsCsv } = await import("../../src/application/contacts-service.js");
    const report = await importContactsCsv(
      db,
      t.tenant.id,
      "name;phone;consent;consent_source;consent_evidence\nMaria;11912345678;sim;planilha;linha 2",
      "x.csv",
      { type: "system" },
    );
    expect(report.skippedSuppressedConsent).toBe(1);
    expect((await db.contact.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("opted_out");
  });
});
