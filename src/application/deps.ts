import type { Prisma, PrismaClient, ProviderAccount } from "@prisma/client";
import type { AppConfig } from "../config.js";
import type { PropertyExtractor } from "../domain/property-parser.js";
import type { PacingPolicy } from "../domain/send-pacing.js";
import type { InboundAdapter } from "../ports/inbound.js";
import type { Logger, QueuePort, SecretsPort, SimulatorLogPort, StoragePort } from "../ports/infra.js";
import type { OutboundMessagingAdapter } from "../ports/outbound.js";

export interface AppDeps {
  db: PrismaClient;
  queue: QueuePort;
  storage: StoragePort;
  secrets: SecretsPort;
  inbound: Record<string, InboundAdapter>;
  outboundFor(account: ProviderAccount): Promise<OutboundMessagingAdapter>;
  extractor: PropertyExtractor;
  /** Baixa mídia do provedor (URL temporária do webhook). */
  fetchMedia(url: string, maxBytes: number): Promise<Buffer>;
  config: Pick<
    AppConfig,
    "MAX_IMAGE_BYTES" | "MAX_DOCUMENT_BYTES" | "ASSET_DELIVERY" | "ASSET_URL_TTL_SECONDS" | "SEND_MAX_ATTEMPTS" | "PUBLIC_BASE_URL"
  >;
  /** Ritmo de envio por número — usado para previsões nas mensagens ao corretor. */
  pacing?: PacingPolicy;
  /** Acesso à API da Omni Z-API (criar webhook ao cadastrar a integração). Ausente = Omni indisponível. */
  omni?: { baseUrl: string; timeoutMs: number; fetchImpl?: typeof fetch };
  /** Conversa do simulador do painel (ausente = simulador desligado). */
  simulator?: SimulatorLogPort;
  logger: Logger;
  now(): Date;
}

export type Tx = Prisma.TransactionClient;

export interface Actor {
  type: "user" | "contact" | "system";
  id?: string | null;
}

export async function audit(
  db: PrismaClient | Tx,
  tenantId: string,
  actor: Actor,
  action: string,
  entity: string,
  entityId: string | null,
  data: Prisma.InputJsonValue = {},
): Promise<void> {
  await db.auditLog.create({
    data: { tenantId, actorType: actor.type, actorId: actor.id ?? null, action, entity, entityId, data },
  });
}

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}
