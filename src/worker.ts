import "./load-env.js";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { processWebhookEvent, RetryLaterError } from "./application/inbound-processor.js";
import { reconcile } from "./application/reconcile.js";
import { processRecipient, RetryableSendError, SendDeferredError, type SendOutcome } from "./application/send-recipient.js";
import { loadConfig, pacingPolicy } from "./config.js";
import { createContainer } from "./container.js";
import { sendDraftSummary } from "./application/property-intake.js";
import { decideSlot, SIMULATOR_PACING, type PacingPolicy } from "./domain/send-pacing.js";
import { isSandboxProvider } from "./domain/sandbox.js";
import { RedisSendPacer } from "./infra/queue/redis-pacer.js";
import type { DraftSummaryJob, SendJob } from "./ports/infra.js";
import { QUEUE_INBOUND, QUEUE_MAINTENANCE, QUEUE_NOTIFY, redisConnection, sendQueueName } from "./infra/queue/bullmq-queue.js";

const cfg = loadConfig();
const { deps, close } = createContainer(cfg);
const conn = () => redisConnection(cfg.REDIS_URL);
const log = deps.logger;
const counters: Record<string, number> = {};

const policy = pacingPolicy(cfg);
const pacerRedis = new Redis(cfg.REDIS_URL, { maxRetriesPerRequest: null });
const pacer = new RedisSendPacer(pacerRedis);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Espera a vez do número (até ~1 intervalo, em processo) ou lança SendDeferredError para esperas longas. */
async function waitTurn(accountId: string, accountPolicy: PacingPolicy): Promise<void> {
  const decision = await pacer.reserve(accountId, (state) => {
    const d = decideSlot(state, Date.now(), accountPolicy);
    return { result: d, next: d.kind === "reserved" ? d.state : null };
  });
  if (decision.kind === "defer") throw new SendDeferredError(decision.until, decision.reason);
  if (decision.waitMs > 0) await sleep(decision.waitMs);
}

/**
 * Worker de envio: uma fila por número de WhatsApp, processada 1 destinatário por vez.
 * O ritmo (intervalo + variação, pausa por lote, janela de horário e teto diário) vem de
 * domain/send-pacing.ts. Números diferentes andam em paralelo, cada um no seu ritmo.
 * Tarefas que esgotam as tentativas ficam retidas na fila como "failed" (DLQ).
 */
function createSendWorker(accountId: string, accountPolicy: PacingPolicy): Worker<SendJob, SendOutcome> {
  const worker: Worker<SendJob, SendOutcome> = new Worker<SendJob, SendOutcome>(
    sendQueueName(accountId),
    async (job) => {
      try {
        const outcome = await processRecipient(deps, {
          ...job.data,
          attempt: job.attemptsMade + 1,
          maxAttempts: job.opts.attempts ?? cfg.SEND_MAX_ATTEMPTS,
          pacing: {
            beforeRecipient: (id) => waitTurn(id, accountPolicy),
            betweenParts: () => sleep(accountPolicy === SIMULATOR_PACING ? 1000 : cfg.SEND_PART_INTERVAL_MS),
          },
        });
        counters[`send.${outcome}`] = (counters[`send.${outcome}`] ?? 0) + 1;
        return outcome;
      } catch (err) {
        if (!(err instanceof SendDeferredError)) throw err;
        // Segura a fila inteira do número até a próxima vaga. A tarefa volta para a espera
        // sem gastar tentativa e sem ter alterado nada no banco.
        const ms = Math.max(1000, err.until - Date.now());
        log.info({ accountId, reason: err.reason, until: new Date(err.until).toISOString() }, "envios do número em espera");
        await worker.rateLimit(ms);
        throw Worker.RateLimitError();
      }
    },
    {
      connection: conn(),
      concurrency: 1,
      // O ritmo real vem do pacer; o limiter precisa existir para o BullMQ respeitar worker.rateLimit().
      limiter: { max: 1000, duration: 1000 },
      // Se o worker morrer no meio, o job volta ("stalled") e processRecipient decide com base no estado salvo.
      stalledInterval: 30_000,
      maxStalledCount: 2,
    },
  );
  worker.on("failed", (job, err) => {
    const level = err instanceof RetryableSendError ? "warn" : "error";
    log[level]({ accountId, jobId: job?.id, attempt: job?.attemptsMade, err: err.message }, "tarefa de envio falhou");
  });
  return worker;
}

const sendWorkers = new Map<string, Worker<SendJob, SendOutcome>>();
/** Garante um worker por número cadastrado (números novos entram em até 30 s). */
async function syncSendWorkers(): Promise<void> {
  const accounts = await deps.db.providerAccount.findMany({ select: { id: true, provider: true } });
  for (const { id, provider } of accounts) {
    // Número do simulador do painel anda em ritmo de demonstração; números reais, no ritmo seguro.
    if (!sendWorkers.has(id)) sendWorkers.set(id, createSendWorker(id, isSandboxProvider(provider) ? SIMULATOR_PACING : policy));
  }
}
await syncSendWorkers();
// Curto para o simulador: o número dele é criado na primeira visita à tela.
const syncTimer = setInterval(() => {
  syncSendWorkers().catch((err) => log.error({ err: (err as Error).message }, "falha ao sincronizar workers de envio"));
}, 5_000);

// Webhooks são processados em série: o corretor manda texto + fotos quase ao mesmo tempo e
// a ordem/concorrência sobre o mesmo rascunho precisa ser controlada. Escala: particionar por tenant.
const inboundWorker = new Worker<{ webhookEventId: string }, string>(
  QUEUE_INBOUND,
  async (job) =>
    processWebhookEvent(deps, job.data.webhookEventId, {
      attempt: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts ?? 6,
    }),
  { connection: conn(), concurrency: 1 },
);

const notifyWorker = new Worker<DraftSummaryJob, string>(QUEUE_NOTIFY, async (job) => sendDraftSummary(deps, job.data), {
  connection: conn(),
  concurrency: 2,
});

const maintenance = new Queue(QUEUE_MAINTENANCE, { connection: conn() });
await maintenance.upsertJobScheduler("reconcile", { every: 60_000 }, { name: "reconcile" });
const maintenanceWorker = new Worker(
  QUEUE_MAINTENANCE,
  async () => {
    const r = await reconcile(deps);
    if (r.requeued || r.webhooks) log.info(r, "reconciliação re-enfileirou tarefas");
    return r;
  },
  { connection: conn(), concurrency: 1 },
);

inboundWorker.on("failed", (job, err) => {
  if (!(err instanceof RetryLaterError)) log.error({ jobId: job?.id, err: err.message }, "processamento de webhook falhou");
});

const metricsTimer = setInterval(() => {
  if (Object.keys(counters).length) log.info({ metrics: counters }, "métricas do worker");
}, 60_000);

// Reconciliação imediata no boot: retoma o que ficou pendente se o worker caiu.
reconcile(deps)
  .then((r) => log.info(r, "worker iniciado — reconciliação inicial"))
  .catch((err) => log.error({ err: (err as Error).message }, "falha na reconciliação inicial"));

async function shutdown(signal: string) {
  log.info({ signal }, "encerrando worker (aguardando tarefas em andamento)");
  clearInterval(metricsTimer);
  clearInterval(syncTimer);
  await Promise.all([...[...sendWorkers.values()].map((w) => w.close()), inboundWorker.close(), notifyWorker.close(), maintenanceWorker.close(), maintenance.close()]);
  await pacerRedis.quit();
  await close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
