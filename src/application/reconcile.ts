import { enqueueQueuedRecipients, maybeComplete } from "./campaign-service.js";
import type { AppDeps } from "./deps.js";

/**
 * Rede de segurança periódica — cobre falhas entre "gravar no banco" e "enfileirar":
 *  - campanhas em processamento com destinatários queued/processing → re-enfileira
 *    (jobId = recipientId evita duplicar tarefas ainda vivas; o worker trata "processing" órfão)
 *  - campanhas sem pendências → concluídas
 *  - webhooks pendentes há mais de 2 min → re-enfileirados
 */
export async function reconcile(deps: AppDeps): Promise<{ campaigns: number; requeued: number; webhooks: number }> {
  const { db } = deps;
  const staleBefore = new Date(deps.now().getTime() - 2 * 60_000);
  const campaigns = await db.campaign.findMany({ where: { status: "processing" }, select: { id: true, tenantId: true } });
  let requeued = 0;
  for (const c of campaigns) {
    const stale = await db.campaignRecipient.count({
      where: { tenantId: c.tenantId, campaignId: c.id, status: { in: ["queued", "processing"] }, updatedAt: { lt: staleBefore } },
    });
    if (stale > 0) requeued += await enqueueQueuedRecipients(deps, c.tenantId, c.id);
    await maybeComplete(deps, c.tenantId, c.id);
  }
  const pending = await db.webhookEvent.findMany({
    where: { processingStatus: "pending", receivedAt: { lt: staleBefore } },
    select: { id: true },
    take: 500,
  });
  for (const w of pending) await deps.queue.enqueueInbound(w.id);
  return { campaigns: campaigns.length, requeued, webhooks: pending.length };
}
