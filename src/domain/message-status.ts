export const MESSAGE_STATUSES = [
  "queued",
  "processing",
  "accepted",
  "sent",
  "delivered",
  "read",
  "failed",
  "cancelled",
  "unknown",
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

/** Progresso de entrega. failed/cancelled/unknown não são "progresso". */
const PROGRESS: Partial<Record<MessageStatus, number>> = {
  queued: 0,
  processing: 1,
  accepted: 2,
  sent: 3,
  delivered: 4,
  read: 5,
};
const DELIVERED = 4;

/**
 * Aplica um status vindo de webhook. Eventos podem chegar fora de ordem
 * (ex.: READ antes de RECEIVED); nunca regredimos o progresso.
 * `unknown` (timeout no envio) pode avançar se o provedor confirmar depois.
 */
export function applyProviderStatus(current: MessageStatus, incoming: MessageStatus): MessageStatus {
  if (current === "cancelled") return current;
  if (incoming === "failed") {
    // Falha reportada depois de entregue/lida é inconsistente — mantém o melhor status conhecido.
    return (PROGRESS[current] ?? 0) >= DELIVERED ? current : "failed";
  }
  const cur = current === "unknown" || current === "failed" ? -1 : (PROGRESS[current] ?? -1);
  const inc = PROGRESS[incoming];
  if (inc === undefined) return current;
  return inc > cur ? incoming : current;
}

/** Status agregado de um destinatário a partir das partes enviadas (imagem, PDF...). */
export function aggregateParts(parts: MessageStatus[]): MessageStatus {
  if (parts.length === 0) return "queued";
  if (parts.some((p) => p === "failed")) return "failed";
  if (parts.some((p) => p === "unknown")) return "unknown";
  if (parts.every((p) => p === "cancelled")) return "cancelled";
  const min = Math.min(...parts.map((p) => PROGRESS[p] ?? 0));
  const found = Object.entries(PROGRESS).find(([, r]) => r === min);
  return (found?.[0] ?? "queued") as MessageStatus;
}

/** Status que encerram o trabalho do worker para um destinatário. */
export function isSettled(status: MessageStatus): boolean {
  return status !== "queued" && status !== "processing";
}

export function isAcceptedOrBetter(status: MessageStatus): boolean {
  return (PROGRESS[status] ?? -1) >= 2;
}
