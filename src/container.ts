import { PrismaClient, type ProviderAccount } from "@prisma/client";
import pino from "pino";
import type { AppDeps } from "./application/deps.js";
import { applyStatusUpdate } from "./application/status-service.js";
import { pacingPolicy, type AppConfig } from "./config.js";
import { DomainError } from "./domain/errors.js";
import { RegexPropertyExtractor } from "./domain/property-parser.js";
import { autoStatus, FakeInboundAdapter, FakeOutboundAdapter } from "./infra/fake/fake-outbound.js";
import { BullQueue, redisConnection } from "./infra/queue/bullmq-queue.js";
import { EncryptedDbSecrets } from "./infra/secrets/db-secrets.js";
import { LocalDiskStorage, S3Storage } from "./infra/storage/storage.js";
import { ZapiInboundAdapter } from "./infra/zapi/zapi-inbound.js";
import { ZapiOutboundAdapter } from "./infra/zapi/zapi-outbound.js";
import { RedisSimulatorLog, SimulatorInboundAdapter, SimulatorOutboundAdapter, SIMULATOR_PROVIDER } from "./infra/simulator/simulator.js";
import { Redis } from "ioredis";
import type { OutboundMessagingAdapter } from "./ports/outbound.js";

export interface Container {
  deps: AppDeps;
  queue: BullQueue;
  fake: FakeOutboundAdapter;
  localStorage: LocalDiskStorage | null;
  close(): Promise<void>;
}

export function createLogger(cfg: AppConfig) {
  return pino({
    level: cfg.LOG_LEVEL,
    // Nunca logar tokens/credenciais.
    redact: ["*.instanceToken", "*.clientToken", "*.token", "req.headers.authorization", "req.headers[\"client-token\"]"],
    transport: cfg.NODE_ENV === "development" ? { target: "pino-pretty", options: { colorize: true } } : undefined,
  });
}

/** Download de mídia com limite de bytes (aborta streams acima do limite). */
export async function fetchMediaLimited(url: string, maxBytes: number): Promise<Buffer> {
  if (!/^https?:\/\//i.test(url)) throw new DomainError("file_unavailable", "URL de mídia inválida");
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok || !res.body) throw new DomainError("file_unavailable", `Arquivo indisponível (HTTP ${res.status})`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new DomainError("file_too_large", "Arquivo acima do limite");
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of res.body) {
    total += chunk.length;
    if (total > maxBytes) throw new DomainError("file_too_large", "Arquivo acima do limite");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function createContainer(cfg: AppConfig): Container {
  const logger = createLogger(cfg);
  const db = new PrismaClient();
  const queue = new BullQueue(redisConnection(cfg.REDIS_URL), cfg.SEND_MAX_ATTEMPTS);
  const localStorage = cfg.STORAGE_DRIVER === "local" ? new LocalDiskStorage(cfg.LOCAL_STORAGE_DIR, cfg.PUBLIC_BASE_URL, cfg.JWT_SECRET) : null;
  const storage = localStorage ?? new S3Storage(cfg);
  const secrets = new EncryptedDbSecrets(db, cfg.SECRETS_MASTER_KEY);
  const fake = new FakeOutboundAdapter();
  fake.log = (to, content) => {
    const preview = content.kind === "text" ? content.text : content.kind === "image" ? `[imagem] ${content.caption ?? ""}` : `[PDF] ${content.fileName}`;
    logger.info({ to, kind: content.kind }, `[fake] → ${preview.slice(0, 160).replace(/\n/g, " ⏎ ")}`);
  };
  const zapiCache = new Map<string, OutboundMessagingAdapter>();
  const simulatorRedis = new Redis(cfg.REDIS_URL, { maxRetriesPerRequest: null });
  const simulator = new RedisSimulatorLog(simulatorRedis);

  const deps: AppDeps = {
    db,
    queue,
    storage,
    secrets,
    inbound: { zapi: new ZapiInboundAdapter(), fake: new FakeInboundAdapter(), [SIMULATOR_PROVIDER]: new SimulatorInboundAdapter() },
    async outboundFor(account: ProviderAccount) {
      if (account.provider === "fake") return fake;
      if (account.provider === SIMULATOR_PROVIDER) return new SimulatorOutboundAdapter(fake, simulator, account.tenantId);
      if (account.provider === "zapi") {
        const cached = zapiCache.get(account.id);
        if (cached) return cached;
        if (!account.configurationRef) throw new Error("conta Z-API sem credenciais");
        const s = await secrets.get(account.tenantId, account.configurationRef);
        const adapter = new ZapiOutboundAdapter(
          { instanceId: account.accountReference, instanceToken: s.instanceToken!, clientToken: s.clientToken },
          cfg.ZAPI_BASE_URL,
          cfg.PROVIDER_TIMEOUT_MS,
        );
        zapiCache.set(account.id, adapter);
        return adapter;
      }
      throw new Error(`provedor sem adaptador de saída: ${account.provider}`);
    },
    extractor: new RegexPropertyExtractor(),
    fetchMedia: fetchMediaLimited,
    config: cfg,
    pacing: pacingPolicy(cfg),
    simulator,
    logger,
    now: () => new Date(),
  };

  if (cfg.FAKE_AUTO_STATUS) {
    autoStatus(fake, async (ids, status) => {
      const part = await db.recipientMessage.findFirst({ where: { providerMessageId: ids[0] } });
      if (part) await applyStatusUpdate(deps, part.tenantId, ids, status, new Date());
    });
  }

  return {
    deps,
    queue,
    fake,
    localStorage,
    async close() {
      await queue.close();
      await simulatorRedis.quit();
      await db.$disconnect();
    },
  };
}
