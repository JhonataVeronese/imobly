import { Queue, type ConnectionOptions } from "bullmq";
import { Redis } from "ioredis";
import type { DraftSummaryJob, QueuePort, SendJob } from "../../ports/infra.js";

/** Prefixo das filas de envio: uma fila por número (conta do provedor), processada 1 por vez. */
export const QUEUE_SEND_PREFIX = "campaign-send-";
export const sendQueueName = (providerAccountId: string) => QUEUE_SEND_PREFIX + providerAccountId;
export const QUEUE_INBOUND = "inbound-events";
export const QUEUE_MAINTENANCE = "maintenance";
export const QUEUE_NOTIFY = "agent-notifications";

/** BullMQ 6 em ESM exige um cliente já construído; workers precisam de maxRetriesPerRequest = null. */
export function redisConnection(url: string): ConnectionOptions {
  return new Redis(url, { maxRetriesPerRequest: null });
}

/**
 * Fila durável (Redis com AOF). Tarefas que esgotam tentativas ficam retidas como "failed"
 * no BullMQ — funcionam como DLQ e podem ser inspecionadas/reprocessadas.
 */
export class BullQueue implements QueuePort {
  readonly inbound: Queue;
  readonly notify: Queue;
  private readonly sendQueues = new Map<string, Queue>();

  constructor(
    private readonly connection: ConnectionOptions,
    private readonly maxAttempts: number,
  ) {
    this.inbound = new Queue(QUEUE_INBOUND, { connection });
    this.notify = new Queue(QUEUE_NOTIFY, { connection });
  }

  sendQueue(providerAccountId: string): Queue {
    let q = this.sendQueues.get(providerAccountId);
    if (!q) {
      q = new Queue(sendQueueName(providerAccountId), { connection: this.connection });
      this.sendQueues.set(providerAccountId, q);
    }
    return q;
  }

  /** Cada número tem sua fila: campanhas de números diferentes andam em paralelo; as do mesmo número, em fila. */
  async enqueueSends(jobs: SendJob[]): Promise<void> {
    const byAccount = new Map<string, SendJob[]>();
    for (const j of jobs) {
      const list = byAccount.get(j.providerAccountId);
      if (list) list.push(j);
      else byAccount.set(j.providerAccountId, [j]);
    }
    for (const [accountId, list] of byAccount) await this.addSends(this.sendQueue(accountId), list);
  }

  private async addSends(queue: Queue, jobs: SendJob[]): Promise<void> {
    for (let i = 0; i < jobs.length; i += 500) {
      await queue.addBulk(
        jobs.slice(i, i + 500).map((j) => ({
          name: "send",
          data: j,
          opts: {
            jobId: j.recipientId,
            attempts: this.maxAttempts,
            backoff: { type: "exponential", delay: 5000 },
            // Concluído sai da fila na hora: o jobId só deduplica tarefas vivas. Assim retomar uma
            // campanha pausada consegue reenfileirar o mesmo destinatário (o estado real fica no banco).
            removeOnComplete: true,
            removeOnFail: false,
          },
        })),
      );
    }
  }

  async enqueueInbound(webhookEventId: string, delayMs = 0): Promise<void> {
    await this.inbound.add(
      "inbound",
      { webhookEventId },
      {
        jobId: delayMs ? `${webhookEventId}-r${Date.now()}` : webhookEventId,
        delay: delayMs,
        attempts: 6,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { age: 24 * 3600 },
        removeOnFail: false,
      },
    );
  }

  /**
   * Debounce nativo do BullMQ: cada nova mensagem do mesmo rascunho substitui o job
   * atrasado e reinicia a espera — o corretor recebe um único resumo no fim da rajada.
   */
  async scheduleDraftSummary(job: DraftSummaryJob, delayMs: number): Promise<void> {
    await this.notify.add("draft-summary", job, {
      delay: delayMs,
      deduplication: { id: `summary-${job.propertyId}`, ttl: delayMs, extend: true, replace: true },
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 24 * 3600 },
    });
  }

  async close(): Promise<void> {
    await Promise.all([...[...this.sendQueues.values()].map((q) => q.close()), this.inbound.close(), this.notify.close()]);
  }
}

/** Fila em memória para testes: registra o que foi enfileirado, com a mesma deduplicação por jobId. */
export class MemoryQueue implements QueuePort {
  readonly sends = new Map<string, SendJob>();
  readonly inbound: string[] = [];
  /** Último resumo agendado por imóvel (mesma semântica de debounce). */
  readonly summaries = new Map<string, DraftSummaryJob>();
  async scheduleDraftSummary(job: DraftSummaryJob) {
    this.summaries.set(job.propertyId, job);
  }
  async enqueueSends(jobs: SendJob[]) {
    for (const j of jobs) if (!this.sends.has(j.recipientId)) this.sends.set(j.recipientId, j);
  }
  async enqueueInbound(id: string) {
    this.inbound.push(id);
  }
  drainSends(): SendJob[] {
    const all = [...this.sends.values()];
    this.sends.clear();
    return all;
  }
}
