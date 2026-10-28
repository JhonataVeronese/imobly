import { InvalidWebhookError, type InboundMedia, type NormalizedInboundEvent } from "../../ports/inbound.js";
import { ZapiInboundAdapter } from "../zapi/zapi-inbound.js";

/**
 * Entrada da Omni Z-API. O webhook é criado com payloadFormat "Z_API", então o corpo segue o
 * formato da Z-API clássica e reaproveita o parser dela. Também entende o formato padrão da Omni
 * (messageEventType NEW_MESSAGE) para mensagens, caso o webhook seja configurado assim no painel.
 *
 * accountReference fica nulo de propósito: quem identifica o número é o token da URL (gravado na
 * entrada) + a assinatura HMAC. O id de instância dentro do payload não é confiável aqui.
 */
export class OmniInboundAdapter extends ZapiInboundAdapter {
  override readonly provider: string = "omni";

  override parse(payload: unknown): NormalizedInboundEvent {
    const p = payload as Record<string, unknown> | null;
    if (p && typeof p === "object" && typeof p.messageEventType === "string") return parseDefaultFormat(p);
    const event = super.parse(payload);
    return { ...event, accountReference: null };
  }
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** Formato padrão da Omni (developer.omni.z-api.io/webhooks/payloads): só mensagens; status não documentado. */
function parseDefaultFormat(p: Obj): NormalizedInboundEvent {
  const m = obj(p.message);
  const id = str(m._id);
  if (!id) throw new InvalidWebhookError("evento Omni sem message._id");
  const externalEventId = `msg:${id}`;
  if (p.messageEventType !== "NEW_MESSAGE") {
    return { type: "ignored", externalEventId, accountReference: null, reason: `omni_${String(p.messageEventType)}` };
  }
  const contents = Array.isArray(m.contents) ? m.contents.map(obj) : [];
  const attachments = Array.isArray(m.attachments) ? m.attachments.map(obj) : [];
  const groupId = [...contents, ...attachments].map((c) => str(obj(c.internal_information).group_id)).find(Boolean) ?? null;
  const sender = obj(m.sender);
  const senderPhone = str(sender.identifier)?.replace(/\D/g, "") || null;
  const media: InboundMedia[] = attachments.flatMap((a) => {
    const url = str(a.url);
    if (!url) return [];
    const kind = a.type === "DOCUMENT" ? "document" : a.type === "IMAGE" ? "image" : null;
    return kind ? [{ kind, url, mimeType: str(a.mime_type), fileName: str(a.file_name) ?? str(a.fileName), caption: str(a.caption) }] : [];
  });
  const text = contents.find((c) => c.type === "TEXT")?.message;
  return {
    type: "message",
    externalEventId,
    accountReference: null,
    messageId: id,
    chatId: groupId ?? senderPhone ?? "",
    isGroup: !!groupId,
    fromMe: obj(m.metadata).from_me === true,
    senderPhone,
    senderName: str(sender.name),
    text: str(text) ?? media.find((x) => x.caption)?.caption ?? null,
    media,
    contacts: [],
    occurredAt: typeof p.moment === "number" ? new Date(p.moment) : new Date(),
  };
}
