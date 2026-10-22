import { aggregateParts, applyProviderStatus, type MessageStatus } from "../domain/message-status.js";
import type { AppDeps } from "./deps.js";

/**
 * Aplica status de entrega vindos do provedor. Retorna quantas partes foram encontradas —
 * 0 pode significar que o webhook chegou antes de gravarmos o messageId (corrida), e o
 * chamador decide se tenta novamente mais tarde.
 */
export async function applyStatusUpdate(
  deps: AppDeps,
  tenantId: string,
  providerMessageIds: string[],
  incoming: MessageStatus,
  occurredAt: Date,
  errorCode: string | null = null,
): Promise<number> {
  const { db } = deps;
  const parts = await db.recipientMessage.findMany({ where: { tenantId, providerMessageId: { in: providerMessageIds } } });
  const touchedRecipients = new Set<string>();
  for (const part of parts) {
    const next = applyProviderStatus(part.status, incoming);
    if (next !== part.status) {
      // CAS pelo status anterior: dois webhooks simultâneos não se sobrescrevem às cegas.
      await db.recipientMessage.updateMany({
        where: { id: part.id, status: part.status },
        data: { status: next, errorCode: next === "failed" ? errorCode : part.errorCode },
      });
    }
    touchedRecipients.add(part.recipientId);
  }

  for (const recipientId of touchedRecipients) {
    const r = await db.campaignRecipient.findUnique({ where: { id: recipientId }, include: { messages: true } });
    if (!r || r.status === "queued" || r.status === "processing" || r.status === "cancelled") continue;
    const agg = aggregateParts(r.messages.map((m) => m.status));
    await db.campaignRecipient.update({
      where: { id: r.id },
      data: {
        status: agg,
        errorCode: agg === "failed" ? (errorCode ?? r.errorCode) : r.errorCode,
        sentAt: r.sentAt ?? (["sent", "delivered", "read"].includes(agg) ? occurredAt : null),
        deliveredAt: r.deliveredAt ?? (["delivered", "read"].includes(agg) ? occurredAt : null),
        readAt: r.readAt ?? (agg === "read" ? occurredAt : null),
      },
    });
  }
  return parts.length;
}
