import { z } from "zod";
import type { PacingPolicy } from "./domain/send-pacing.js";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3000),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET precisa de 32+ caracteres"),
  SECRETS_MASTER_KEY: z.string().refine((v) => Buffer.from(v, "base64").length === 32, "SECRETS_MASTER_KEY: 32 bytes base64"),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default("./data/storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("imobzap-assets"),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool,
  ASSET_URL_TTL_SECONDS: z.coerce.number().default(3600),
  ASSET_DELIVERY: z.enum(["url", "base64"]).default("base64"),
  MAX_IMAGE_BYTES: z.coerce.number().default(5 * 1024 * 1024),
  MAX_DOCUMENT_BYTES: z.coerce.number().default(15 * 1024 * 1024),
  SEND_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  // Ritmo por número de WhatsApp (ver domain/send-pacing.ts). Padrões conservadores.
  SEND_MIN_INTERVAL_MS: z.coerce.number().int().min(1000).default(20_000),
  SEND_JITTER_MS: z.coerce.number().int().min(0).default(20_000),
  SEND_PART_INTERVAL_MS: z.coerce.number().int().min(0).default(3_000),
  SEND_BATCH_SIZE: z.coerce.number().int().min(0).default(40),
  SEND_BATCH_PAUSE_MS: z.coerce.number().int().min(0).default(10 * 60_000),
  SEND_DAILY_CAP: z.coerce.number().int().positive().default(300),
  SEND_WINDOW_START_HOUR: z.coerce.number().int().min(0).max(23).default(8),
  SEND_WINDOW_END_HOUR: z.coerce.number().int().min(1).max(24).default(20),
  SEND_TIMEZONE: z.string().default("America/Sao_Paulo"),
  ZAPI_BASE_URL: z.string().url().default("https://api.z-api.io"),
  PROVIDER_TIMEOUT_MS: z.coerce.number().default(15000),
  FAKE_AUTO_STATUS: bool,
  LOG_LEVEL: z.string().default("info"),
});

export type AppConfig = z.infer<typeof schema>;

export function pacingPolicy(cfg: AppConfig): PacingPolicy {
  return {
    minIntervalMs: cfg.SEND_MIN_INTERVAL_MS,
    jitterMs: cfg.SEND_JITTER_MS,
    batchSize: cfg.SEND_BATCH_SIZE,
    batchPauseMs: cfg.SEND_BATCH_PAUSE_MS,
    dailyCap: cfg.SEND_DAILY_CAP,
    windowStartHour: cfg.SEND_WINDOW_START_HOUR,
    windowEndHour: cfg.SEND_WINDOW_END_HOUR,
    timeZone: cfg.SEND_TIMEZONE,
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const r = schema.safeParse(env);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuração inválida: ${issues}`);
  }
  if (r.data.SEND_WINDOW_END_HOUR <= r.data.SEND_WINDOW_START_HOUR) {
    throw new Error("Configuração inválida: SEND_WINDOW_END_HOUR precisa ser maior que SEND_WINDOW_START_HOUR");
  }
  return r.data;
}
