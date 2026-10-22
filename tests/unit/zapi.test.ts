import { describe, expect, it } from "vitest";
import { ZapiInboundAdapter } from "../../src/infra/zapi/zapi-inbound.js";
import { classifyHttpError, ZapiOutboundAdapter } from "../../src/infra/zapi/zapi-outbound.js";
import { InvalidWebhookError } from "../../src/ports/inbound.js";
import { ProviderError } from "../../src/ports/outbound.js";

const inbound = new ZapiInboundAdapter();

describe("Z-API inbound", () => {
  it("normaliza mensagem de grupo com participante e documento", () => {
    const e = inbound.parse({
      type: "ReceivedCallback",
      instanceId: "I1",
      messageId: "ABC",
      phone: "120363-group",
      isGroup: true,
      fromMe: false,
      participantPhone: "5511988887777",
      momment: 1700000000000,
      document: { documentUrl: "https://z/doc.pdf", mimeType: "application/pdf", fileName: "ficha.pdf" },
    });
    expect(e).toMatchObject({
      type: "message",
      externalEventId: "msg:ABC",
      chatId: "120363-group",
      senderPhone: "5511988887777",
      media: [{ kind: "document", url: "https://z/doc.pdf", fileName: "ficha.pdf" }],
    });
  });
  it("usa a legenda da imagem como texto", () => {
    const e = inbound.parse({
      type: "ReceivedCallback",
      messageId: "X",
      phone: "5511",
      image: { imageUrl: "https://z/i.jpg", caption: "Casa R$ 300 mil" },
    });
    expect(e.type === "message" && e.text).toBe("Casa R$ 300 mil");
  });
  it("mapeia status (RECEIVED → delivered) e ignora READ_BY_ME", () => {
    const s = inbound.parse({ type: "MessageStatusCallback", status: "RECEIVED", ids: ["b", "a"] });
    expect(s).toMatchObject({ type: "status", status: "delivered", externalEventId: "status:RECEIVED:a,b" });
    expect(inbound.parse({ type: "MessageStatusCallback", status: "READ_BY_ME", ids: ["a"] }).type).toBe("ignored");
  });
  it("DeliveryCallback com erro vira falha", () => {
    const s = inbound.parse({ type: "DeliveryCallback", messageId: "m1", error: "number not exists" });
    expect(s).toMatchObject({ type: "status", status: "failed" });
  });
  it("rejeita payload inválido", () => {
    expect(() => inbound.parse({ foo: 1 })).toThrow(InvalidWebhookError);
    expect(() => inbound.parse({ type: "ReceivedCallback" })).toThrow(InvalidWebhookError);
  });
});

describe("Z-API outbound", () => {
  it("monta URL, headers e corpo conforme a documentação", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchMock = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ zaapId: "z1", messageId: "m1", id: "m1" }), { status: 200 });
    }) as unknown as typeof fetch;
    const a = new ZapiOutboundAdapter({ instanceId: "INST", instanceToken: "TOK", clientToken: "CT" }, "https://api.z-api.io", 1000, fetchMock);
    const r = await a.send("+5511999990000", { kind: "document", extension: "pdf", fileName: "Ficha", media: { mimeType: "application/pdf", url: "https://s/x.pdf" } });
    expect(r.providerMessageId).toBe("m1");
    expect(calls[0]!.url).toBe("https://api.z-api.io/instances/INST/token/TOK/send-document/pdf");
    expect((calls[0]!.init.headers as Record<string, string>)["Client-Token"]).toBe("CT");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ phone: "5511999990000", document: "https://s/x.pdf", fileName: "Ficha" });
  });
  it("timeout vira resultado desconhecido", async () => {
    const fetchMock = (async () => {
      throw Object.assign(new Error("t"), { name: "TimeoutError" });
    }) as unknown as typeof fetch;
    const a = new ZapiOutboundAdapter({ instanceId: "I", instanceToken: "T" }, "https://x", 10, fetchMock);
    await expect(a.send("+5511999990000", { kind: "text", text: "oi" })).rejects.toMatchObject({ kind: "timeout" });
  });
  it("classifica erros HTTP", () => {
    expect(classifyHttpError(429, "", "2")).toMatchObject({ kind: "rate_limited", retryAfterMs: 2000 });
    expect(classifyHttpError(401, "", null).kind).toBe("account_restricted");
    expect(classifyHttpError(400, '{"error":"You are not connected"}', null).kind).toBe("account_restricted");
    expect(classifyHttpError(400, '{"error":"invalid phone"}', null).kind).toBe("permanent");
    expect(classifyHttpError(503, "", null).kind).toBe("transient");
    expect(classifyHttpError(500, "", null).kind).toBe("timeout");
    expect(classifyHttpError(500, "", null)).toBeInstanceOf(ProviderError);
  });
});
