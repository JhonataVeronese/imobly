import { z } from "zod";
import type { MessageStatus } from "../../domain/message-status.js";
import {
  InvalidWebhookError,
  type InboundAdapter,
  type InboundMedia,
  type NormalizedInboundEvent,
} from "../../ports/inbound.js";

/**
 * Tradução dos webhooks da Z-API. Campos conferidos em developer.z-api.io:
 *  - ReceivedCallback (on-message-received / exemplos de retorno)
 *  - MessageStatusCallback (on-whatsapp-message-status-changes): SENT, RECEIVED, READ, READ_BY_ME, PLAYED
 *  - DeliveryCallback (on-message-send)
 * A Z-API NÃO assina webhooks: a autenticação é feita pelo token secreto na URL (ver webhook-intake).
 * Pontos a validar na Fase 0 (ver docs/FASE0-VALIDACAO.md): participantPhone em grupos com LID,
 * qual id aparece em `ids` do status (messageId vs zaapId), e envio de eventos de mídia.
 */
const media = z.object({}).passthrough();

const received = z
  .object({
    type: z.literal("ReceivedCallback"),
    instanceId: z.string().optional(),
    messageId: z.string().min(1),
    phone: z.string().min(1),
    fromMe: z.boolean().default(false),
    isGroup: z.boolean().default(false),
    isNewsletter: z.boolean().optional(),
    isStatusReply: z.boolean().optional(),
    isEdit: z.boolean().optional(),
    broadcast: z.boolean().optional(),
    momment: z.number().optional(),
    participantPhone: z.string().nullish(),
    senderName: z.string().nullish(),
    text: z.object({ message: z.string().nullish() }).passthrough().nullish(),
    image: media.nullish(),
    document: media.nullish(),
  })
  .passthrough();

const status = z
  .object({
    type: z.literal("MessageStatusCallback"),
    instanceId: z.string().optional(),
    status: z.string(),
    ids: z.array(z.string()).min(1),
    momment: z.number().optional(),
    isGroup: z.boolean().optional(),
  })
  .passthrough();

const delivery = z
  .object({
    type: z.literal("DeliveryCallback"),
    instanceId: z.string().optional(),
    messageId: z.string().min(1),
    error: z.string().nullish(),
    momment: z.number().optional(),
  })
  .passthrough();

const STATUS_MAP: Record<string, MessageStatus | undefined> = {
  SENT: "sent",
  RECEIVED: "delivered",
  READ: "read",
  PLAYED: "read",
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function at(momment?: number): Date {
  return momment ? new Date(momment) : new Date();
}

export class ZapiInboundAdapter implements InboundAdapter {
  readonly provider: string = "zapi";

  parse(payload: unknown): NormalizedInboundEvent {
    const type = (payload as { type?: unknown } | null)?.type;
    if (typeof type !== "string") throw new InvalidWebhookError("payload sem campo type");
    const instanceId = str((payload as { instanceId?: unknown }).instanceId);

    if (type === "ReceivedCallback") {
      const r = received.safeParse(payload);
      if (!r.success) throw new InvalidWebhookError(`ReceivedCallback inválido: ${r.error.issues[0]?.message}`);
      const p = r.data;
      const eventId = p.isEdit ? `msg:${p.messageId}:edit:${p.momment ?? 0}` : `msg:${p.messageId}`;
      if (p.isStatusReply || p.isNewsletter || p.broadcast) {
        return { type: "ignored", externalEventId: eventId, accountReference: instanceId, reason: "status_newsletter_broadcast" };
      }
      if (p.isEdit) {
        return { type: "ignored", externalEventId: eventId, accountReference: instanceId, reason: "edited_message" };
      }
      const mediaList: InboundMedia[] = [];
      if (p.image) {
        const url = str(p.image.imageUrl);
        if (url) {
          mediaList.push({ kind: "image", url, mimeType: str(p.image.mimeType), fileName: null, caption: str(p.image.caption) });
        }
      }
      if (p.document) {
        const url = str(p.document.documentUrl);
        if (url) {
          mediaList.push({
            kind: "document",
            url,
            mimeType: str(p.document.mimeType),
            fileName: str(p.document.fileName) ?? str(p.document.title),
            caption: str(p.document.caption),
          });
        }
      }
      const caption = mediaList.find((m) => m.caption)?.caption ?? null;
      const sender = p.isGroup ? (p.participantPhone ?? null) : p.phone;
      return {
        type: "message",
        externalEventId: eventId,
        accountReference: instanceId,
        messageId: p.messageId,
        chatId: p.phone,
        isGroup: p.isGroup,
        fromMe: p.fromMe,
        senderPhone: sender ? sender.replace(/\D/g, "") || null : null,
        senderName: p.senderName ?? null,
        text: p.text?.message ?? caption,
        media: mediaList,
        occurredAt: at(p.momment),
      };
    }

    if (type === "MessageStatusCallback") {
      const r = status.safeParse(payload);
      if (!r.success) throw new InvalidWebhookError(`MessageStatusCallback inválido: ${r.error.issues[0]?.message}`);
      const p = r.data;
      const eventId = `status:${p.status}:${[...p.ids].sort().join(",")}`;
      const mapped = STATUS_MAP[p.status];
      if (!mapped) return { type: "ignored", externalEventId: eventId, accountReference: instanceId, reason: `status_${p.status}` };
      return {
        type: "status",
        externalEventId: eventId,
        accountReference: instanceId,
        providerMessageIds: p.ids,
        status: mapped,
        isGroup: p.isGroup ?? false,
        errorCode: null,
        occurredAt: at(p.momment),
      };
    }

    if (type === "DeliveryCallback") {
      const r = delivery.safeParse(payload);
      if (!r.success) throw new InvalidWebhookError(`DeliveryCallback inválido: ${r.error.issues[0]?.message}`);
      const p = r.data;
      const eventId = `delivery:${p.messageId}`;
      // Sem erro, o DeliveryCallback só confirma o que já sabemos pela resposta do envio (accepted).
      if (!p.error) return { type: "ignored", externalEventId: eventId, accountReference: instanceId, reason: "delivery_ok" };
      return {
        type: "status",
        externalEventId: eventId,
        accountReference: instanceId,
        providerMessageIds: [p.messageId],
        status: "failed",
        isGroup: false,
        errorCode: p.error.slice(0, 120),
        occurredAt: at(p.momment),
      };
    }

    // Conexão/desconexão, presença etc. Ficam registrados para diagnóstico.
    return { type: "ignored", externalEventId: `other:${type}:${Date.now()}`, accountReference: instanceId, reason: `type_${type}` };
  }
}
