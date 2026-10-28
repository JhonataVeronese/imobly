import { createHash, randomBytes } from "node:crypto";
import type { Prisma, ProviderAccount } from "@prisma/client";
import { DomainError } from "../domain/errors.js";
import { verifyOmniSignature } from "../infra/omni/omni-signature.js";
import { InvalidWebhookError } from "../ports/inbound.js";
import { isUniqueViolation, type AppDeps } from "./deps.js";

export function hashWebhookToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateWebhookToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashWebhookToken(token) };
}

export type IntakeResult =
  | { status: "accepted"; webhookEventId: string }
  | { status: "duplicate" }
  | { status: "ignored"; reason: string };

/**
 * Parte síncrona do webhook — só operações rápidas:
 * autentica → normaliza → deduplica (unique provider+external_event_id) → persiste → enfileira.
 * Nunca processa campanha nem baixa mídia aqui.
 */
export interface WebhookRequestContext {
  /** Corpo exato recebido (já descompactado), para verificar assinatura. */
  rawBody?: Buffer;
  headers?: Record<string, string | string[] | undefined>;
}

export async function receiveWebhook(
  deps: AppDeps,
  provider: string,
  token: string,
  payload: unknown,
  ctx: WebhookRequestContext = {},
): Promise<IntakeResult> {
  const adapter = deps.inbound[provider];
  if (!adapter) throw new DomainError("unknown_provider", "Provedor desconhecido", 404);

  // O segredo é o token aleatório na URL, guardado só como hash (a Z-API clássica não assina webhooks).
  const account = await deps.db.providerAccount.findUnique({ where: { webhookTokenHash: hashWebhookToken(token) } });
  if (!account || account.provider !== provider || account.status !== "active") {
    throw new DomainError("unauthorized_webhook", "Webhook não autorizado", 401);
  }
  await verifyProviderSignature(deps, account, ctx);
  return ingestWebhook(deps, account, payload);
}

/** Omni Z-API assina cada entrega (HMAC-SHA256); com segredo cadastrado, assinatura inválida é recusada. */
async function verifyProviderSignature(deps: AppDeps, account: ProviderAccount, ctx: WebhookRequestContext) {
  if (account.provider !== "omni" || !account.configurationRef) return;
  const { webhookSecret } = await deps.secrets.get(account.tenantId, account.configurationRef);
  if (!webhookSecret) return; // webhook configurado à mão, sem assinatura: vale só o token da URL
  const check = verifyOmniSignature(ctx.rawBody ?? Buffer.alloc(0), ctx.headers ?? {}, webhookSecret, Math.floor(deps.now().getTime() / 1000));
  if (!check.ok) throw new DomainError("unauthorized_webhook", `Assinatura do webhook inválida (${check.reason})`, 401);
}

/**
 * Normaliza, deduplica, persiste e enfileira um evento de uma conta já autenticada.
 * O simulador do painel entra por aqui com a conta sandbox: mesmo caminho de um webhook real.
 */
export async function ingestWebhook(deps: AppDeps, account: ProviderAccount, payload: unknown): Promise<IntakeResult> {
  const provider = account.provider;
  const adapter = deps.inbound[provider];
  if (!adapter) throw new DomainError("unknown_provider", "Provedor desconhecido", 404);

  let event;
  try {
    event = adapter.parse(payload);
  } catch (err) {
    if (err instanceof InvalidWebhookError) throw new DomainError("invalid_webhook", err.message, 400);
    throw err;
  }
  // Defesa extra: o evento precisa ser da instância cadastrada para este token.
  if (event.accountReference && event.accountReference !== account.accountReference) {
    throw new DomainError("unauthorized_webhook", "Instância do evento não corresponde à conta", 401);
  }

  try {
    const row = await deps.db.webhookEvent.create({
      data: {
        tenantId: account.tenantId,
        providerAccountId: account.id,
        provider,
        externalEventId: event.externalEventId,
        eventType: event.type,
        payload: payload as Prisma.InputJsonValue,
        processingStatus: event.type === "ignored" ? "ignored" : "pending",
        processingNote: event.type === "ignored" ? event.reason : null,
        processedAt: event.type === "ignored" ? deps.now() : null,
      },
    });
    if (event.type === "ignored") return { status: "ignored", reason: event.reason };
    await deps.queue.enqueueInbound(row.id);
    return { status: "accepted", webhookEventId: row.id };
  } catch (err) {
    if (isUniqueViolation(err)) return { status: "duplicate" };
    throw err;
  }
}
