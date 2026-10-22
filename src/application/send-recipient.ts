import type { PropertyAsset } from "@prisma/client";
import { aggregateParts, isAcceptedOrBetter, type MessageStatus } from "../domain/message-status.js";
import { formatBRL, renderTemplate } from "../domain/template.js";
import { ProviderError, type MediaRef, type OutboundContent } from "../ports/outbound.js";
import { maybeComplete, pauseCampaign } from "./campaign-service.js";
import { canReceiveMarketing } from "./consent-service.js";
import type { AppDeps } from "./deps.js";

/** Erro que pede nova tentativa ao worker (BullMQ aplica backoff). */
export class RetryableSendError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "RetryableSendError";
  }
}

/** A vez do número ainda não chegou (pausa de lote, fora da janela, teto diário): tentar de novo em `until`. */
export class SendDeferredError extends Error {
  constructor(
    readonly until: number,
    readonly reason: string,
  ) {
    super(`envio adiado (${reason}) até ${new Date(until).toISOString()}`);
    this.name = "SendDeferredError";
  }
}

/** Ritmo do número de envio. Ausente = sem espera (testes e ferramentas). */
export interface SendPacing {
  /** Antes do 1º envio do destinatário: espera a vez do número ou lança SendDeferredError (nada foi alterado). */
  beforeRecipient(providerAccountId: string): Promise<void>;
  /** Entre as partes do mesmo destinatário (foto+texto, depois PDF). */
  betweenParts(): Promise<void>;
}

export interface SendAttempt {
  tenantId: string;
  recipientId: string;
  /** 1-based */
  attempt: number;
  maxAttempts: number;
  pacing?: SendPacing;
}

export type SendOutcome =
  | "sent"
  | "skipped_settled"
  | "skipped_campaign_paused"
  | "cancelled_campaign"
  | "cancelled_consent"
  | "failed_permanent"
  | "failed_exhausted"
  | "unknown"
  | "paused_account";

interface PartPlan {
  kind: "text" | "image" | "document";
  build(): Promise<OutboundContent>;
}

const FAILURE_PAUSE_MIN = 10;
const FAILURE_PAUSE_RATIO = 0.3;

/**
 * Processa UM destinatário. Garantias:
 *  - Cada parte (imagem, PDF) tem estado próprio: retry nunca reenvia parte já aceita.
 *  - Parte marcada "processing" ao reiniciar = o worker caiu no meio da chamada → `unknown`, sem reenvio.
 *  - Timeout do provedor → `unknown` (pode ter sido aceito), sem reenvio automático.
 *  - Consentimento e estado da campanha são revalidados imediatamente antes do envio.
 */
export async function processRecipient(deps: AppDeps, job: SendAttempt): Promise<SendOutcome> {
  const { db } = deps;
  const { tenantId } = job;
  const recipient = await db.campaignRecipient.findFirst({
    where: { id: job.recipientId, tenantId },
    include: { campaign: { include: { property: { include: { assets: { orderBy: { position: "asc" } } } } } }, contact: true },
  });
  if (!recipient) return "skipped_settled";
  if (recipient.status !== "queued" && recipient.status !== "processing") return "skipped_settled";

  const campaign = recipient.campaign;
  if (campaign.status === "paused" || campaign.status === "scheduled") return "skipped_campaign_paused";
  if (campaign.status !== "processing") {
    await db.campaignRecipient.updateMany({ where: { id: recipient.id, status: "queued" }, data: { status: "cancelled" } });
    return "cancelled_campaign";
  }

  if (!(await canReceiveMarketing(db, tenantId, recipient.contactId))) {
    await db.campaignRecipient.updateMany({
      where: { id: recipient.id, status: { in: ["queued", "processing"] } },
      data: { status: "cancelled", errorCode: "consent_revoked" },
    });
    await maybeComplete(deps, tenantId, campaign.id);
    return "cancelled_consent";
  }

  // Só quem vai realmente receber consome a vez do número.
  if (job.pacing) {
    await job.pacing.beforeRecipient(campaign.providerAccountId!);
    // A espera pode levar dezenas de segundos: pausa/cancelamento nesse meio-tempo vale.
    const fresh = await db.campaign.findFirst({ where: { id: campaign.id, tenantId }, select: { status: true } });
    if (fresh?.status !== "processing") return "skipped_campaign_paused";
  }

  if (recipient.status === "queued") {
    const claimed = await db.campaignRecipient.updateMany({
      where: { id: recipient.id, status: "queued" },
      data: { status: "processing", attemptCount: { increment: 1 } },
    });
    if (claimed.count === 0) return "skipped_settled";
  }

  const plan = buildPlan(deps, campaign, recipient.contact.name);
  await db.recipientMessage.createMany({
    data: plan.map((p, part) => ({ tenantId, recipientId: recipient.id, part, kind: p.kind })),
    skipDuplicates: true,
  });
  const account = await db.providerAccount.findFirstOrThrow({ where: { id: campaign.providerAccountId!, tenantId } });
  const adapter = await deps.outboundFor(account);

  const parts = await db.recipientMessage.findMany({ where: { recipientId: recipient.id }, orderBy: { part: "asc" } });
  let sentNow = 0;
  for (const part of parts) {
    if (isAcceptedOrBetter(part.status)) continue;
    if (part.status === "processing") {
      // Execução anterior foi interrompida durante a chamada ao provedor: resultado desconhecido.
      await db.recipientMessage.update({ where: { id: part.id }, data: { status: "unknown", errorCode: "interrupted" } });
      return settle(deps, recipient.id, tenantId, campaign.id, "unknown", "interrupted_during_send");
    }
    if (part.status !== "queued") break; // failed/unknown/cancelled: não continua as próximas partes

    if (sentNow > 0) await job.pacing?.betweenParts();
    const content = await plan[part.part]!.build();
    const claimed = await db.recipientMessage.updateMany({ where: { id: part.id, status: "queued" }, data: { status: "processing" } });
    if (claimed.count === 0) return "skipped_settled";

    try {
      const { providerMessageId } = await adapter.send(recipient.phoneE164, content);
      sentNow++;
      await db.recipientMessage.update({
        where: { id: part.id },
        data: { status: "accepted", providerMessageId, acceptedAt: deps.now() },
      });
      if (part.part === 0) {
        await db.campaignRecipient.update({ where: { id: recipient.id }, data: { providerMessageId } });
      }
    } catch (err) {
      if (!(err instanceof ProviderError)) {
        await db.recipientMessage.update({ where: { id: part.id }, data: { status: "queued" } });
        await db.campaignRecipient.update({ where: { id: recipient.id }, data: { status: "queued" } });
        throw err;
      }
      return handleProviderError(deps, job, recipient.id, part.id, campaign.id, err);
    }
  }

  const finalParts = await db.recipientMessage.findMany({ where: { recipientId: recipient.id }, select: { status: true } });
  const agg = aggregateParts(finalParts.map((p) => p.status));
  return settle(deps, recipient.id, tenantId, campaign.id, agg, null);
}

async function handleProviderError(
  deps: AppDeps,
  job: SendAttempt,
  recipientId: string,
  partId: string,
  campaignId: string,
  err: ProviderError,
): Promise<SendOutcome> {
  const { db } = deps;
  const log = { recipientId, campaignId, kind: err.kind, code: err.code, attempt: job.attempt };
  switch (err.kind) {
    case "timeout":
      deps.logger.warn(log, "envio com resultado desconhecido (timeout) — não será reenviado automaticamente");
      await db.recipientMessage.update({ where: { id: partId }, data: { status: "unknown", errorCode: err.code } });
      return settle(deps, recipientId, job.tenantId, campaignId, "unknown", err.code);

    case "permanent":
      deps.logger.warn(log, "falha permanente do destinatário");
      await db.recipientMessage.update({ where: { id: partId }, data: { status: "failed", errorCode: err.code } });
      await settle(deps, recipientId, job.tenantId, campaignId, "failed", err.code, err.message);
      await checkFailureRate(deps, job.tenantId, campaignId);
      return "failed_permanent";

    case "account_restricted":
      // Conta desconectada/restrita: interrompe a campanha inteira em vez de insistir.
      deps.logger.error(log, "conta do provedor restrita — pausando campanha");
      await db.recipientMessage.update({ where: { id: partId }, data: { status: "queued" } });
      await db.campaignRecipient.update({ where: { id: recipientId }, data: { status: "queued" } });
      await pauseCampaign(deps, job.tenantId, campaignId, { type: "system" }, `provedor: ${err.code}`).catch(() => undefined);
      return "paused_account";

    case "transient":
    case "rate_limited":
      await db.recipientMessage.update({ where: { id: partId }, data: { status: "queued", errorCode: err.code } });
      if (job.attempt >= job.maxAttempts) {
        await db.recipientMessage.update({ where: { id: partId }, data: { status: "failed" } });
        await settle(deps, recipientId, job.tenantId, campaignId, "failed", "retries_exhausted", err.message);
        return "failed_exhausted";
      }
      await db.campaignRecipient.update({ where: { id: recipientId }, data: { status: "queued", errorCode: err.code } });
      throw new RetryableSendError(`${err.kind}: ${err.code}`, err.retryAfterMs);
  }
}

async function settle(
  deps: AppDeps,
  recipientId: string,
  tenantId: string,
  campaignId: string,
  status: MessageStatus,
  errorCode: string | null,
  errorMessage?: string,
): Promise<SendOutcome> {
  await deps.db.campaignRecipient.update({
    where: { id: recipientId },
    data: { status, errorCode, errorMessage: errorMessage?.slice(0, 500) ?? null },
  });
  await maybeComplete(deps, tenantId, campaignId);
  return status === "unknown" ? "unknown" : status === "failed" ? "failed_permanent" : "sent";
}

/** Sinal de qualidade: muitas falhas permanentes → pausa para o corretor revisar a base. */
async function checkFailureRate(deps: AppDeps, tenantId: string, campaignId: string) {
  const [failed, settledCount] = await Promise.all([
    deps.db.campaignRecipient.count({ where: { tenantId, campaignId, status: "failed" } }),
    deps.db.campaignRecipient.count({ where: { tenantId, campaignId, status: { notIn: ["queued", "processing", "cancelled"] } } }),
  ]);
  if (failed >= FAILURE_PAUSE_MIN && failed / settledCount > FAILURE_PAUSE_RATIO) {
    await pauseCampaign(deps, tenantId, campaignId, { type: "system" }, `taxa de falha elevada (${failed}/${settledCount})`).catch(
      () => undefined,
    );
  }
}

type CampaignWithProperty = NonNullable<Awaited<ReturnType<typeof loadCampaign>>>;
async function loadCampaign(deps: AppDeps, id: string) {
  return deps.db.campaign.findUnique({ where: { id }, include: { property: { include: { assets: true } } } });
}

/** Partes da mensagem: [imagem de destaque + texto] ou [texto], seguida do PDF quando existir. */
function buildPlan(deps: AppDeps, campaign: CampaignWithProperty, contactName: string): PartPlan[] {
  const p = campaign.property;
  const firstName = contactName.split(/\s+/)[0] ?? "";
  const text = renderTemplate(campaign.messageTemplate, {
    nome: contactName === "Sem nome" ? null : contactName,
    primeiro_nome: contactName === "Sem nome" ? null : firstName,
    titulo: p.title,
    preco: p.price != null ? formatBRL(Number(p.price)) : null,
    descricao: p.description,
    bairro: p.neighborhood,
    cidade: p.city,
  });
  const image = p.assets.find((a) => a.kind === "image");
  const pdf = p.assets.find((a) => a.kind === "document");
  const plan: PartPlan[] = [];
  if (image) {
    plan.push({ kind: "image", build: async () => ({ kind: "image", media: await mediaRef(deps, image), caption: text }) });
  } else {
    plan.push({ kind: "text", build: async () => ({ kind: "text", text }) });
  }
  if (pdf) {
    plan.push({
      kind: "document",
      build: async () => ({
        kind: "document",
        media: await mediaRef(deps, pdf),
        extension: "pdf",
        fileName: pdf.originalName?.replace(/\.pdf$/i, "") || p.title || "Ficha do imóvel",
      }),
    });
  }
  return plan;
}

const mediaCache = new Map<string, { at: number; ref: MediaRef }>();

async function mediaRef(deps: AppDeps, asset: PropertyAsset): Promise<MediaRef> {
  const cached = mediaCache.get(asset.id);
  const ttlMs = (deps.config.ASSET_URL_TTL_SECONDS * 1000) / 2;
  if (cached && Date.now() - cached.at < ttlMs) return cached.ref;
  const ref: MediaRef =
    deps.config.ASSET_DELIVERY === "url"
      ? { mimeType: asset.mimeType, url: await deps.storage.signedUrl(asset.storageKey, deps.config.ASSET_URL_TTL_SECONDS) }
      : { mimeType: asset.mimeType, base64: (await deps.storage.get(asset.storageKey)).toString("base64") };
  if (mediaCache.size > 200) mediaCache.clear();
  mediaCache.set(asset.id, { at: Date.now(), ref });
  return ref;
}
