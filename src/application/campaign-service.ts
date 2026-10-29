import type { Campaign, PrismaClient, Property } from "@prisma/client";
import {
  audienceSchema,
  isCompatibleWithProperty,
  matchesAudience,
  parsePreferences,
  type Audience,
  type PropertyProfile,
} from "../domain/audience.js";
import { allowedSources, CAMPAIGN_STATUS_LABEL, type CampaignStatus } from "../domain/campaign.js";
import { DomainError, NotFoundError } from "../domain/errors.js";
import { estimateDurationMs, formatDuration, SIMULATOR_PACING } from "../domain/send-pacing.js";
import { isSandboxProvider, sandboxContactFilter, SIMULATOR_PROVIDER } from "../domain/sandbox.js";
import { DEFAULT_TEMPLATE, validateTemplate } from "../domain/template.js";
import { eligibleContactWhere } from "./consent-service.js";
import { audit, type Actor, type AppDeps, type Tx } from "./deps.js";

const DEFAULT_CAMPAIGN_NAME = "Campanha";

export function propertyProfile(p: Property): PropertyProfile {
  return {
    propertyType: p.propertyType,
    city: p.city,
    neighborhood: p.neighborhood,
    price: p.price != null ? Number(p.price) : null,
    bedrooms: p.bedrooms,
  };
}

export function parseAudience(raw: unknown): Audience {
  return audienceSchema.parse(raw ?? {});
}

/** Contatos elegíveis = ativos + consentimento vigente + fora da supressão + compatíveis com o público. */
export async function findEligibleContacts(
  db: PrismaClient | Tx,
  tenantId: string,
  audience: Audience,
  property: Property,
  sandbox = false,
) {
  const suppressed = new Set(
    (await db.suppressionEntry.findMany({ where: { tenantId }, select: { phoneE164: true } })).map((s) => s.phoneE164),
  );
  const candidates = await db.contact.findMany({
    where: {
      ...eligibleContactWhere(tenantId),
      ...sandboxContactFilter(sandbox),
      // Lista vazia = sem seleção manual: vale o público do imóvel, não "ninguém".
      ...(audience.contactIds?.length ? { id: { in: audience.contactIds } } : {}),
    },
    select: { id: true, phoneE164: true, preferences: true, tags: true },
  });
  const profile = propertyProfile(property);
  return candidates.filter(
    (c) => !suppressed.has(c.phoneE164) && matchesAudience({ preferences: parsePreferences(c.preferences), tags: c.tags }, audience, profile),
  );
}

async function transition(
  db: PrismaClient | Tx,
  tenantId: string,
  campaignId: string,
  to: CampaignStatus,
  extra: Partial<Pick<Campaign, "startedAt" | "completedAt" | "cancelledAt" | "confirmedAt" | "confirmedByUserId" | "statusReason" | "eligibleCount">> = {},
  from: CampaignStatus[] = allowedSources(to),
): Promise<boolean> {
  // Compare-and-set: só uma requisição concorrente vence a transição.
  const r = await db.campaign.updateMany({ where: { id: campaignId, tenantId, status: { in: from } }, data: { status: to, ...extra } });
  return r.count === 1;
}

/** Campanha do número do simulador? Decide de que lado do isolamento ficam os contatos. */
async function isSandboxAccount(db: PrismaClient | Tx, tenantId: string, providerAccountId: string | null): Promise<boolean> {
  if (!providerAccountId) return false;
  const a = await db.providerAccount.findFirst({ where: { id: providerAccountId, tenantId }, select: { provider: true } });
  return isSandboxProvider(a?.provider);
}

async function getCampaign(db: PrismaClient | Tx, tenantId: string, id: string) {
  const c = await db.campaign.findFirst({ where: { id, tenantId } });
  if (!c) throw new NotFoundError("Campanha");
  return c;
}

export interface CreateCampaignInput {
  propertyId: string;
  name?: string;
  audience?: unknown;
  messageTemplate?: string;
  providerAccountId?: string | null;
}

export async function createCampaign(deps: AppDeps, tenantId: string, input: CreateCampaignInput, actor: Actor) {
  const property = await deps.db.property.findFirst({ where: { id: input.propertyId, tenantId } });
  if (!property) throw new NotFoundError("Imóvel");
  const audience = parseAudience(input.audience);
  const template = input.messageTemplate ?? DEFAULT_TEMPLATE;
  const errors = validateTemplate(template);
  if (errors.length) throw new DomainError("invalid_template", errors.join("; "));

  const account = input.providerAccountId
    ? await deps.db.providerAccount.findFirst({ where: { id: input.providerAccountId, tenantId } })
    : // O número do simulador só é usado quando pedido explicitamente.
      await deps.db.providerAccount.findFirst({
        where: { tenantId, status: "active", provider: { not: SIMULATOR_PROVIDER } },
        orderBy: { createdAt: "asc" },
      });

  const eligible = await findEligibleContacts(deps.db, tenantId, audience, property, isSandboxProvider(account?.provider));
  const campaign = await deps.db.campaign.create({
    data: {
      tenantId,
      propertyId: property.id,
      providerAccountId: account?.id ?? null,
      name: input.name ?? property.title ?? DEFAULT_CAMPAIGN_NAME,
      status: "awaiting_confirmation",
      audience,
      eligibleCount: eligible.length,
      messageTemplate: template,
      requestedByUserId: actor.type === "user" ? (actor.id ?? null) : null,
    },
  });
  await audit(deps.db, tenantId, actor, "campaign.created", "campaign", campaign.id, { eligible: eligible.length });
  return campaign;
}

/** Recalcula a estimativa de público (ex.: após o corretor corrigir os dados do imóvel). */
export async function refreshEstimate(deps: AppDeps, tenantId: string, campaignId: string) {
  const c = await getCampaign(deps.db, tenantId, campaignId);
  if (c.status !== "awaiting_confirmation" && c.status !== "draft") return c;
  const property = await deps.db.property.findFirstOrThrow({ where: { id: c.propertyId, tenantId } });
  const sandbox = await isSandboxAccount(deps.db, tenantId, c.providerAccountId);
  const eligible = await findEligibleContacts(deps.db, tenantId, parseAudience(c.audience), property, sandbox);
  // Campanha criada antes do texto (mídia chegou primeiro) recebe o título do imóvel quando ele existir.
  const name = c.name === DEFAULT_CAMPAIGN_NAME && property.title ? property.title : c.name;
  return deps.db.campaign.update({ where: { id: c.id }, data: { eligibleCount: eligible.length, name } });
}

/**
 * Contatos que o corretor pode escolher no painel: ativos, com consentimento e fora da supressão,
 * sem o filtro de preferências (a escolha manual é dele). `matchesProperty` só informa o perfil.
 */
export async function listSelectableContacts(deps: AppDeps, tenantId: string, campaignId: string, page: number, q?: string) {
  const c = await getCampaign(deps.db, tenantId, campaignId);
  const property = await deps.db.property.findFirstOrThrow({ where: { id: c.propertyId, tenantId } });
  const sandbox = await isSandboxAccount(deps.db, tenantId, c.providerAccountId);
  const suppressed = new Set(
    (await deps.db.suppressionEntry.findMany({ where: { tenantId }, select: { phoneE164: true } })).map((s) => s.phoneE164),
  );
  const search = q?.trim();
  const contacts = await deps.db.contact.findMany({
    where: {
      ...eligibleContactWhere(tenantId),
      ...sandboxContactFilter(sandbox),
      ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { phoneE164: { contains: search.replace(/\D/g, "") || search } }] } : {}),
    },
    select: { id: true, name: true, phoneE164: true, preferences: true },
    orderBy: { name: "asc" },
  });
  const profile = propertyProfile(property);
  const all = contacts
    .filter((x) => !suppressed.has(x.phoneE164))
    .map((x) => ({ id: x.id, name: x.name, phoneE164: x.phoneE164, matchesProperty: isCompatibleWithProperty(parsePreferences(x.preferences), profile) }));
  const size = 50;
  return {
    items: all.slice((page - 1) * size, page * size),
    total: all.length,
    page,
    selectedIds: parseAudience(c.audience).contactIds ?? [],
  };
}

export interface ConfirmResult {
  campaign: Campaign;
  alreadyConfirmed: boolean;
  recipients: number;
  warning?: string;
}

/**
 * Confirmação explícita do corretor. Idempotente: confirmações repetidas (comando reenviado,
 * duplo clique, webhook repetido) retornam a mesma campanha sem criar destinatários/envios extras.
 */
export async function confirmCampaign(deps: AppDeps, tenantId: string, campaignId: string, actor: Actor): Promise<ConfirmResult> {
  const now = deps.now();
  const current = await getCampaign(deps.db, tenantId, campaignId);
  if (current.status !== "awaiting_confirmation") {
    if (["processing", "paused", "completed", "scheduled"].includes(current.status)) {
      return { campaign: current, alreadyConfirmed: true, recipients: current.eligibleCount };
    }
    throw new DomainError("invalid_transition", `Campanha está ${CAMPAIGN_STATUS_LABEL[current.status]} e não pode ser confirmada`, 409);
  }

  // Validações antes de iniciar: provedor, conteúdo, arquivos e limites do plano.
  if (!current.providerAccountId) throw new DomainError("no_provider", "Nenhuma integração de envio configurada");
  const property = await deps.db.property.findFirstOrThrow({ where: { id: current.propertyId, tenantId }, include: { assets: true } });
  const tplErrors = validateTemplate(current.messageTemplate);
  if (tplErrors.length) throw new DomainError("invalid_template", tplErrors.join("; "));
  if (!property.description && !property.title) throw new DomainError("empty_property", "Imóvel sem texto para divulgar");
  for (const a of property.assets) {
    await deps.storage.get(a.storageKey).catch(() => {
      throw new DomainError("asset_unavailable", `Arquivo indisponível: ${a.originalName ?? a.id}`);
    });
  }

  const sandbox = await isSandboxAccount(deps.db, tenantId, current.providerAccountId);
  const audience = parseAudience(current.audience);

  const warning = audience.contactIds?.length
    ? undefined
    : "Nenhum contato foi selecionado: a campanha foi enviada para todos os contatos elegíveis.";

  const result = await deps.db.$transaction(async (tx) => {
    const won = await transition(tx, tenantId, campaignId, "processing", {
      confirmedAt: now,
      startedAt: now,
      confirmedByUserId: actor.type === "user" ? (actor.id ?? null) : null,
    }, ["awaiting_confirmation"]);
    if (!won) return null; // outra confirmação concorrente venceu

    // Público é congelado no momento da confirmação.
    const eligible = await findEligibleContacts(tx, tenantId, audience, property, sandbox);

    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const used = await tx.campaignRecipient.count({
      where: { tenantId, queuedAt: { gte: monthStart }, status: { not: "cancelled" }, contact: sandboxContactFilter(false) },
    });
    // Simulador não envia nada de verdade: não consome o limite do plano.
    if (!sandbox && used + eligible.length > tenant.monthlyMessageLimit) {
      throw new DomainError(
        "plan_limit_exceeded",
        `Limite mensal do plano excedido (${used} usados + ${eligible.length} > ${tenant.monthlyMessageLimit})`,
        402,
      );
    }

    await tx.campaignRecipient.createMany({
      data: eligible.map((c) => ({ tenantId, campaignId, contactId: c.id, phoneE164: c.phoneE164, queuedAt: now })),
      skipDuplicates: true, // unique(campaign_id, contact_id)
    });
    await tx.campaign.update({ where: { id: campaignId }, data: { eligibleCount: eligible.length } });
    await tx.property.updateMany({ where: { id: property.id, tenantId, status: "draft" }, data: { status: "active" } });
    await audit(tx, tenantId, actor, "campaign.confirmed", "campaign", campaignId, { recipients: eligible.length });
    return eligible.length;
  });

  if (result === null) {
    return { campaign: await getCampaign(deps.db, tenantId, campaignId), alreadyConfirmed: true, recipients: current.eligibleCount, warning };
  }
  // Enfileira após o commit. Se o processo cair aqui, o reconciliador re-enfileira os "queued".
  await enqueueQueuedRecipients(deps, tenantId, campaignId);
  await maybeComplete(deps, tenantId, campaignId);
  return { campaign: await getCampaign(deps.db, tenantId, campaignId), alreadyConfirmed: false, recipients: result, warning };
}

export async function enqueueQueuedRecipients(deps: AppDeps, tenantId: string, campaignId: string): Promise<number> {
  const { providerAccountId } = await getCampaign(deps.db, tenantId, campaignId);
  if (!providerAccountId) return 0;
  const queued = await deps.db.campaignRecipient.findMany({
    where: { tenantId, campaignId, status: { in: ["queued", "processing"] } },
    select: { id: true },
    // Ordem de entrada na fila do número = ordem de cadastro do público.
    orderBy: { queuedAt: "asc" },
  });
  await deps.queue.enqueueSends(queued.map((r) => ({ tenantId, recipientId: r.id, providerAccountId })));
  return queued.length;
}

/** Previsão de duração do envio no ritmo do número (sem contar outras campanhas na mesma fila). */
export function sendEstimate(deps: AppDeps, recipients: number, provider?: string): { durationMs: number; label: string } | null {
  const policy = provider === SIMULATOR_PROVIDER ? SIMULATOR_PACING : deps.pacing;
  if (!policy || recipients <= 0) return null;
  const durationMs = estimateDurationMs(recipients, deps.now().getTime(), policy);
  return { durationMs, label: formatDuration(durationMs) };
}

export async function pauseCampaign(deps: AppDeps, tenantId: string, campaignId: string, actor: Actor, reason?: string) {
  const c = await getCampaign(deps.db, tenantId, campaignId);
  if (c.status === "paused") return c;
  if (!(await transition(deps.db, tenantId, campaignId, "paused", { statusReason: reason ?? null }))) {
    throw new DomainError("invalid_transition", `Campanha ${CAMPAIGN_STATUS_LABEL[c.status]} não pode ser pausada`, 409);
  }
  await audit(deps.db, tenantId, actor, "campaign.paused", "campaign", campaignId, { reason: reason ?? null });
  return getCampaign(deps.db, tenantId, campaignId);
}

export async function resumeCampaign(deps: AppDeps, tenantId: string, campaignId: string, actor: Actor) {
  const c = await getCampaign(deps.db, tenantId, campaignId);
  if (c.status === "processing") return c;
  if (!(await transition(deps.db, tenantId, campaignId, "processing", { statusReason: null }, ["paused"]))) {
    throw new DomainError("invalid_transition", `Campanha ${CAMPAIGN_STATUS_LABEL[c.status]} não pode ser retomada`, 409);
  }
  await audit(deps.db, tenantId, actor, "campaign.resumed", "campaign", campaignId);
  await enqueueQueuedRecipients(deps, tenantId, campaignId);
  await maybeComplete(deps, tenantId, campaignId);
  return getCampaign(deps.db, tenantId, campaignId);
}

/** Cancela o que ainda não foi enviado. Mensagens já aceitas pelo provedor não podem ser "desenviadas". */
export async function cancelCampaign(deps: AppDeps, tenantId: string, campaignId: string, actor: Actor) {
  const c = await getCampaign(deps.db, tenantId, campaignId);
  if (c.status === "cancelled") return c;
  const now = deps.now();
  const ok = await deps.db.$transaction(async (tx) => {
    if (!(await transition(tx, tenantId, campaignId, "cancelled", { cancelledAt: now }))) return false;
    await tx.campaignRecipient.updateMany({ where: { tenantId, campaignId, status: "queued" }, data: { status: "cancelled" } });
    await audit(tx, tenantId, actor, "campaign.cancelled", "campaign", campaignId);
    return true;
  });
  if (!ok) throw new DomainError("invalid_transition", `Campanha ${CAMPAIGN_STATUS_LABEL[c.status]} não pode ser cancelada`, 409);
  return getCampaign(deps.db, tenantId, campaignId);
}

export async function maybeComplete(deps: AppDeps, tenantId: string, campaignId: string): Promise<boolean> {
  const pending = await deps.db.campaignRecipient.count({
    where: { tenantId, campaignId, status: { in: ["queued", "processing"] } },
  });
  if (pending > 0) return false;
  const done = await transition(deps.db, tenantId, campaignId, "completed", { completedAt: deps.now() }, ["processing"]);
  if (done) await audit(deps.db, tenantId, { type: "system" }, "campaign.completed", "campaign", campaignId);
  return done;
}

export async function campaignMetrics(db: PrismaClient, tenantId: string, campaignId: string) {
  const c = await getCampaign(db, tenantId, campaignId);
  const groups = await db.campaignRecipient.groupBy({ by: ["status"], where: { tenantId, campaignId }, _count: true });
  const by = Object.fromEntries(groups.map((g) => [g.status, g._count])) as Record<string, number>;
  const n = (k: string) => by[k] ?? 0;
  const total = Object.values(by).reduce((a, b) => a + b, 0);
  const accepted = n("accepted") + n("sent") + n("delivered") + n("read");
  const delivered = n("delivered") + n("read");
  const optOuts = await db.suppressionEntry.count({ where: { tenantId, campaignId } });
  const durationMs = c.startedAt && c.completedAt ? c.completedAt.getTime() - c.startedAt.getTime() : null;
  return {
    eligible: c.eligibleCount,
    recipients: total,
    queued: n("queued") + n("processing"),
    accepted,
    sent: n("sent") + delivered,
    delivered,
    read: n("read"),
    failed: n("failed"),
    unknown: n("unknown"),
    cancelled: n("cancelled"),
    optOuts,
    durationMs,
    // Denominadores explícitos: entrega sobre aceitas pelo provedor; leitura sobre entregues
    // (ausência de confirmação de leitura não é falha — o contato pode ter desativado recibos).
    deliveryRate: accepted ? delivered / accepted : null,
    readRate: delivered ? n("read") / delivered : null,
    byStatus: by,
  };
}
