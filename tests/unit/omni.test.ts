import { describe, expect, it } from "vitest";
import { classifyOmniError, OmniClient } from "../../src/infra/omni/omni-client.js";
import { OmniInboundAdapter } from "../../src/infra/omni/omni-inbound.js";
import { OmniOutboundAdapter } from "../../src/infra/omni/omni-outbound.js";
import { signOmniWebhook, verifyOmniSignature } from "../../src/infra/omni/omni-signature.js";
import { contactsFromCard } from "../../src/infra/zapi/zapi-inbound.js";

const SECRET = "a".repeat(64);
const NOW = 1_800_000_000;

describe("assinatura dos webhooks da Omni", () => {
  const body = Buffer.from('{"type":"ReceivedCallback","messageId":"X"}');

  it("aceita a assinatura correta e recusa corpo alterado, segredo errado e replay", () => {
    const h = signOmniWebhook(body, SECRET, NOW, "channel-events:3:1542");
    expect(verifyOmniSignature(body, h, SECRET, NOW)).toEqual({ ok: true });
    expect(verifyOmniSignature(Buffer.from('{"type":"x"}'), h, SECRET, NOW)).toMatchObject({ ok: false, reason: "bad_signature" });
    expect(verifyOmniSignature(body, h, "b".repeat(64), NOW)).toMatchObject({ ok: false, reason: "bad_signature" });
    expect(verifyOmniSignature(body, h, SECRET, NOW + 301)).toMatchObject({ ok: false, reason: "stale_signature" });
    expect(verifyOmniSignature(body, {}, SECRET, NOW)).toMatchObject({ ok: false, reason: "missing_signature_headers" });
  });

  it("tópico com ':' na chave de idempotência", () => {
    const h = signOmniWebhook(body, SECRET, NOW, "ns:topic:7:99");
    expect(verifyOmniSignature(body, h, SECRET, NOW).ok).toBe(true);
  });
});

function recorder(status = 200, response: unknown = { messageId: "01A0C92D0C957FE98B73C8BA0CACF741" }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(response), { status });
  }) as unknown as typeof fetch;
  const client = new OmniClient({ channelId: "CH1", secretKey: "sk_live_x" }, "https://api.omni.test", 5000, fetchImpl);
  return { calls, adapter: new OmniOutboundAdapter(client), body: (i = 0) => JSON.parse(String(calls[i]!.init.body)) };
}

describe("envio pela Omni", () => {
  it("texto: rota, Bearer e corpo documentados", async () => {
    const r = recorder();
    expect(await r.adapter.send("+5545998382060", { kind: "text", text: "Olá" })).toEqual({
      providerMessageId: "01A0C92D0C957FE98B73C8BA0CACF741",
    });
    expect(r.calls[0]!.url).toBe("https://api.omni.test/v1/channels/CH1/messages");
    expect((r.calls[0]!.init.headers as Record<string, string>).Authorization).toBe("Bearer sk_live_x");
    expect(r.body()).toEqual({ recipient: { identifier: "5545998382060" }, content: { type: "TEXT", body: { message: "Olá" } } });
  });

  it("imagem vai por URL com legenda; sem URL é falha permanente", async () => {
    const r = recorder();
    await r.adapter.send("+5511999999999", { kind: "image", media: { mimeType: "image/png", url: "https://x/f.png" }, caption: "Apto" });
    expect(r.body().content).toEqual({ type: "IMAGE", attachments: [{ url: "https://x/f.png", caption: "Apto" }] });
    await expect(
      r.adapter.send("+5511999999999", { kind: "image", media: { mimeType: "image/png", base64: "AAAA" } }),
    ).rejects.toMatchObject({ kind: "permanent", code: "media_url_required" });
    expect(r.adapter.mediaDelivery).toEqual({ mode: "url", ttlSeconds: 30 * 24 * 3600 });
  });

  it("PDF vai como texto com o link enquanto DOCUMENT não estiver disponível na Omni", async () => {
    const r = recorder();
    await r.adapter.send("+5511999999999", {
      kind: "document",
      media: { mimeType: "application/pdf", url: "https://x/ficha.pdf?sig=1" },
      fileName: "Ficha Apto",
      extension: "pdf",
    });
    expect(r.body().content).toEqual({ type: "TEXT", body: { message: "📄 Ficha Apto.pdf\nhttps://x/ficha.pdf?sig=1" } });
  });

  it("classifica os erros documentados", () => {
    expect(classifyOmniError(400, '{"error":"Authorization invalid"}', null).kind).toBe("account_restricted");
    expect(classifyOmniError(422, '{"code":"BUSINESS_RULE_VIOLATION","subCode":"CHANNEL_DISCONNECTED"}', null)).toMatchObject({
      kind: "account_restricted",
      code: "channel_disconnected",
    });
    expect(classifyOmniError(429, "", "3")).toMatchObject({ kind: "rate_limited", retryAfterMs: 3000 });
    expect(classifyOmniError(400, '{"error":"invalid recipient"}', null).kind).toBe("permanent");
    expect(classifyOmniError(500, "", null).kind).toBe("timeout");
  });

  it("cria o webhook assinado no formato Z-API", async () => {
    const r = recorder(201, { id: "WH1", secret: "f".repeat(64) });
    const client = new OmniClient({ channelId: "CH1", secretKey: "sk" }, "https://api.omni.test", 5000, (async (url: string, init: RequestInit) => {
      r.calls.push({ url, init });
      return new Response(JSON.stringify({ id: "WH1", secret: "f".repeat(64) }), { status: 201 });
    }) as unknown as typeof fetch);
    expect(await client.createWebhook("https://api.imobly/webhooks/omni/tok")).toEqual({ id: "WH1", secret: "f".repeat(64) });
    expect(r.calls[0]!.url).toBe("https://api.omni.test/v1/channels/CH1/webhooks");
    expect(r.body()).toMatchObject({ events: ["MESSAGE_RECEIVED", "MESSAGE_STATUS"], signing: true, payloadFormat: "Z_API" });
  });
});

describe("entrada pela Omni", () => {
  const adapter = new OmniInboundAdapter();

  it("formato Z_API: reaproveita o parser da Z-API e não confia no id de instância", () => {
    const ev = adapter.parse({
      type: "ReceivedCallback",
      instanceId: "OUTRO",
      messageId: "M1",
      phone: "5545998382060",
      isGroup: false,
      fromMe: false,
      text: { message: "oi" },
    });
    expect(ev).toMatchObject({ type: "message", text: "oi", senderPhone: "5545998382060", accountReference: null, contacts: [] });
  });

  it("formato padrão da Omni (NEW_MESSAGE): texto e imagem", () => {
    const ev = adapter.parse({
      messageEventType: "NEW_MESSAGE",
      message: {
        _id: "01A0",
        metadata: { from_me: false },
        sender: { identifier: "5545998382060", name: "Jhonata" },
        contents: [{ type: "TEXT", message: "Apartamento no Centro" }],
        attachments: [{ type: "IMAGE", url: "https://cdn/x.jpg", caption: "fachada" }],
      },
    });
    expect(ev).toMatchObject({
      type: "message",
      messageId: "01A0",
      chatId: "5545998382060",
      isGroup: false,
      text: "Apartamento no Centro",
      media: [{ kind: "image", url: "https://cdn/x.jpg" }],
    });
  });
});

describe("cartões de contato", () => {
  it("lê o waid do vCard, o campo phones e o nome", () => {
    expect(
      contactsFromCard({
        displayName: "Ana Souza",
        vCard: "BEGIN:VCARD\nVERSION:3.0\nFN:Ana Souza\nTEL;type=CELL;waid=5545998382060:+55 45 99838-2060\nEND:VCARD",
      }),
    ).toEqual([{ name: "Ana Souza", phone: "5545998382060" }]);
    expect(contactsFromCard({ vCard: "BEGIN:VCARD\r\nFN:Bruno\r\nitem1.TEL:+55 (11) 98888-7777\r\nEND:VCARD" })).toEqual([
      { name: "Bruno", phone: "5511988887777" },
    ]);
    expect(contactsFromCard({ displayName: "Carla", phones: ["5511977776666"] })).toEqual([{ name: "Carla", phone: "5511977776666" }]);
    expect(contactsFromCard({ displayName: "Sem número", vCard: "BEGIN:VCARD\nFN:X\nEND:VCARD" })).toEqual([]);
  });
});
