import { createHash, randomUUID } from "node:crypto";
import type { Prisma, Property, ProviderAccount, User } from "@prisma/client";
import { parseAgentCommand } from "../domain/commands.js";
import { DomainError } from "../domain/errors.js";
import { validateFile } from "../domain/file-validation.js";
import { looksLikeProperty, type ExtractedProperty, type PropertyUnit } from "../domain/property-parser.js";
import { formatBRL } from "../domain/template.js";
import type { InboundMedia, InboundMessageEvent } from "../ports/inbound.js";
import type { DraftSummaryJob } from "../ports/infra.js";
import { CAMPAIGN_STATUS_LABEL } from "../domain/campaign.js";
import { isSandboxProvider, SIMULATOR_PROVIDER } from "../domain/sandbox.js";
import {
  cancelCampaign,
  campaignMetrics,
  confirmCampaign,
  createCampaign,
  pauseCampaign,
  refreshEstimate,
  resumeCampaign,
  sendEstimate,
} from "./campaign-service.js";
import { audit, isUniqueViolation, type AppDeps } from "./deps.js";

const DRAFT_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * Fluxo do corretor no canal de entrada (grupo privado ou conversa direta):
 *  - texto descrevendo imóvel → cria/corrige o rascunho aberto e a campanha em awaiting_confirmation
 *  - fotos/PDF → anexam ao rascunho aberto (a Z-API entrega cada mídia como mensagem separada,
 *    sem ordem garantida, por isso mídia antes do texto também cria o rascunho)
 *  - CONFIRMAR / CANCELAR / STATUS / PAUSAR / RETOMAR / AJUDA → comandos
 * Um rascunho aberto por corretor; ele fecha ao confirmar ou cancelar.
 * Conteúdo recebido é DADO: nada no texto/PDF altera destinatários, permissões ou configurações.
 */
export async function handleAgentMessage(
  deps: AppDeps,
  account: ProviderAccount,
  user: User,
  msg: InboundMessageEvent,
): Promise<string> {
  const reply = (text: string) => sendReply(deps, account, msg.chatId, text);
  const tenantId = user.tenantId;
  const actor = { type: "user" as const, id: user.id };

  // Comandos e rascunhos valem só para o canal de onde vieram: o simulador nunca confirma,
  // pausa ou corrige uma campanha real, e vice-versa.
  const scope = await campaignScope(deps, account);
  const command = msg.text && msg.media.length === 0 ? parseAgentCommand(msg.text) : null;
  if (command === "confirm") {
    const campaign = await deps.db.campaign.findFirst({
      where: { tenantId, requestedByUserId: user.id, ...scope, status: "awaiting_confirmation" },
      orderBy: { createdAt: "desc" },
    });
    if (!campaign) {
      await reply("Não há campanha aguardando confirmação.");
      return "confirm_none";
    }
    try {
      const r = await confirmCampaign(deps, tenantId, campaign.id, actor);
      const eta = sendEstimate(deps, r.recipients, account.provider);
      await reply(
        r.alreadyConfirmed
          ? "Essa campanha já estava confirmada."
          : [
              `🚀 Campanha *${r.campaign.name}* na fila para ${r.recipients} contatos.`,
              eta ? `⏱ Envio em ritmo seguro para o seu número: previsão de *${eta.label}*.` : null,
              "Responda STATUS para acompanhar ou PAUSAR para interromper.",
            ]
              .filter(Boolean)
              .join("\n"),
      );
      return "confirmed";
    } catch (err) {
      if (err instanceof DomainError) {
        await reply(`⚠️ Não foi possível iniciar: ${err.message}`);
        return `confirm_rejected:${err.code}`;
      }
      throw err;
    }
  }
  if (command === "cancel") {
    const campaign = await deps.db.campaign.findFirst({
      where: { tenantId, requestedByUserId: user.id, ...scope, status: { in: ["awaiting_confirmation", "draft"] } },
      orderBy: { createdAt: "desc" },
    });
    if (!campaign) {
      await reply("Não há rascunho para cancelar.");
      return "cancel_none";
    }
    await cancelCampaign(deps, tenantId, campaign.id, actor);
    await deps.db.property.updateMany({ where: { id: campaign.propertyId, tenantId, status: "draft" }, data: { status: "archived" } });
    await reply("❌ Rascunho cancelado. Nenhuma mensagem foi enviada.");
    return "cancelled";
  }
  if (command === "status") {
    const campaign = await deps.db.campaign.findFirst({ where: { tenantId, requestedByUserId: user.id, ...scope }, orderBy: { createdAt: "desc" } });
    if (!campaign) {
      await reply("Nenhuma campanha encontrada.");
      return "status_none";
    }
    const m = await campaignMetrics(deps.db, tenantId, campaign.id);
    const eta = campaign.status === "processing" ? sendEstimate(deps, m.queued, account.provider) : null;
    await reply(
      [
        `📊 *${campaign.name}* — ${CAMPAIGN_STATUS_LABEL[campaign.status]}`,
        campaign.status === "paused" && campaign.statusReason ? `Motivo: ${campaign.statusReason}` : null,
        `Destinatários: ${m.recipients} · Na fila: ${m.queued}`,
        `Aceitas: ${m.accepted} · Entregues: ${m.delivered} · Lidas: ${m.read}`,
        `Falhas: ${m.failed} · Desconhecidas: ${m.unknown} · Descadastros: ${m.optOuts}`,
        eta ? `⏱ Previsão para terminar: ${eta.label}` : null,
        campaign.status === "paused" ? "Responda RETOMAR para continuar." : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    return "status";
  }
  if (command === "pause") {
    const campaign = await deps.db.campaign.findFirst({
      where: { tenantId, requestedByUserId: user.id, ...scope, status: "processing" },
      orderBy: { createdAt: "desc" },
    });
    if (!campaign) {
      await reply("Não há campanha em envio para pausar.");
      return "pause_none";
    }
    await pauseCampaign(deps, tenantId, campaign.id, actor, "pausada pelo corretor no WhatsApp");
    await reply(`⏸ Campanha *${campaign.name}* pausada. Quem ainda não recebeu continua na fila. Responda RETOMAR para continuar.`);
    return "paused";
  }
  if (command === "resume") {
    const campaign = await deps.db.campaign.findFirst({
      where: { tenantId, requestedByUserId: user.id, ...scope, status: "paused" },
      orderBy: { createdAt: "desc" },
    });
    if (!campaign) {
      await reply("Não há campanha pausada para retomar.");
      return "resume_none";
    }
    await resumeCampaign(deps, tenantId, campaign.id, actor);
    const m = await campaignMetrics(deps.db, tenantId, campaign.id);
    const eta = sendEstimate(deps, m.queued, account.provider);
    await reply(`▶️ Campanha *${campaign.name}* retomada: ${m.queued} contato(s) na fila.${eta ? ` Previsão: ${eta.label}.` : ""}`);
    return "resumed";
  }
  if (command === "help") {
    await reply(HELP_TEXT);
    return "help";
  }

  // Conteúdo de imóvel
  let draft = await findOpenDraft(deps, tenantId, user.id, scope);
  const extracted = msg.text ? await deps.extractor.extract(msg.text) : null;
  const isPropertyText = !!extracted && looksLikeProperty(extracted);

  if (extracted && isPropertyText) {
    draft = draft
      ? await deps.db.property.update({ where: { id: draft.id }, data: propertyData(extracted, msg.text!) })
      : await deps.db.property.create({
          data: { tenantId, createdByUserId: user.id, status: "draft", ...propertyData(extracted, msg.text!) },
        });
    await audit(deps.db, tenantId, actor, "property.ingested", "property", draft.id, { messageId: msg.messageId });
  } else if (msg.media.length > 0 && !draft) {
    draft = await deps.db.property.create({ data: { tenantId, createdByUserId: user.id, status: "draft" } });
  }

  if (!draft) {
    await reply(
      "Não identifiquei um imóvel nessa mensagem. Envie o texto com tipo, valor e características (ex.: quartos, vagas), " +
        "junto com fotos e o PDF. Responda AJUDA para ver os comandos.",
    );
    return "not_property";
  }

  const rejected: string[] = [];
  for (const [i, media] of msg.media.entries()) {
    try {
      await storeAsset(deps, tenantId, draft.id, media, `${msg.messageId}:${i}`);
    } catch (err) {
      if (err instanceof DomainError) rejected.push(`${media.fileName ?? media.kind}: ${err.message}`);
      else throw err;
    }
  }

  let campaign = await deps.db.campaign.findFirst({ where: { tenantId, propertyId: draft.id, status: "awaiting_confirmation" } });
  campaign = campaign ? await refreshEstimate(deps, tenantId, campaign.id) : await createCampaign(
        deps,
        tenantId,
        // Rascunho feito no simulador do painel envia pelo número do simulador (só para contatos de teste).
        { propertyId: draft.id, providerAccountId: isSandboxProvider(account.provider) ? account.id : undefined },
        actor,
      );

  if (rejected.length) await reply(`⚠️ Arquivo(s) rejeitado(s):\n${rejected.join("\n")}`);
  // Texto e fotos chegam como mensagens separadas, em rajada. Em vez de responder a cada uma,
  // agendamos UM resumo que é adiado enquanto novas mensagens do mesmo rascunho continuam chegando.
  await deps.queue.scheduleDraftSummary(
    { tenantId, propertyId: draft.id, providerAccountId: account.id, chatId: msg.chatId },
    DRAFT_SUMMARY_DEBOUNCE_MS,
  );
  return extracted && isPropertyText ? "draft_updated" : "assets_attached";
}

export const DRAFT_SUMMARY_DEBOUNCE_MS = 8000;

export const HELP_TEXT = [
  "🤖 *imobly — comandos*",
  "",
  "*Divulgar um imóvel:* envie o texto do anúncio (tipo, valor, bairro, quartos, vagas) + fotos + PDF. Eu respondo com um resumo e o público estimado.",
  "*Corrigir:* envie o texto de novo antes de confirmar.",
  "",
  "*CONFIRMAR* — coloca a campanha na fila de envio",
  "*CANCELAR* — descarta o rascunho (nada é enviado)",
  "*STATUS* — andamento da última campanha",
  "*PAUSAR* — interrompe o envio em andamento",
  "*RETOMAR* — continua uma campanha pausada",
  "*AJUDA* — mostra esta lista",
  "",
  "Os envios saem em fila, com intervalo entre contatos e só em horário comercial, para proteger o seu número.",
].join("\n");

/** Resumo único do rascunho, enviado após a rajada de mensagens do corretor. */
export async function sendDraftSummary(deps: AppDeps, job: DraftSummaryJob): Promise<string> {
  const { tenantId, propertyId } = job;
  const property = await deps.db.property.findFirst({ where: { id: propertyId, tenantId } });
  const campaign = await deps.db.campaign.findFirst({ where: { tenantId, propertyId, status: "awaiting_confirmation" } });
  // Confirmado ou cancelado durante a espera: nada a resumir.
  if (!property || property.status !== "draft" || !campaign) return "skipped";
  const account = await deps.db.providerAccount.findFirst({ where: { id: job.providerAccountId, tenantId } });
  if (!account) return "skipped";

  const assets = await deps.db.propertyAsset.groupBy({ by: ["kind"], where: { tenantId, propertyId }, _count: true });
  if (!property.sourceText) {
    const count = assets.reduce((n, a) => n + a._count, 0);
    await sendReply(deps, account, job.chatId, `📎 ${count} anexo(s) recebido(s). Envie também o texto do imóvel.`);
    return "assets_only";
  }
  await sendReply(deps, account, job.chatId, summary(property, assets, campaign.eligibleCount, deps.config.PUBLIC_BASE_URL, sendEstimate(deps, campaign.eligibleCount, account.provider)?.label ?? null));
  return "summary_sent";
}

type CampaignScope = Prisma.CampaignWhereInput;

/** Campanhas do canal: as do número do simulador, ou as de qualquer número real. */
async function campaignScope(deps: AppDeps, account: ProviderAccount): Promise<CampaignScope> {
  if (isSandboxProvider(account.provider)) return { providerAccountId: account.id };
  const sandboxIds = (
    await deps.db.providerAccount.findMany({ where: { tenantId: account.tenantId, provider: SIMULATOR_PROVIDER }, select: { id: true } })
  ).map((a) => a.id);
  return sandboxIds.length ? { OR: [{ providerAccountId: null }, { providerAccountId: { notIn: sandboxIds } }] } : {};
}

async function findOpenDraft(deps: AppDeps, tenantId: string, userId: string, scope: CampaignScope): Promise<Property | null> {
  return deps.db.property.findFirst({
    where: {
      tenantId,
      createdByUserId: userId,
      status: "draft",
      updatedAt: { gte: new Date(deps.now().getTime() - DRAFT_WINDOW_MS) },
      // Todo rascunho nasce com a campanha em "aguardando confirmação"; ela diz de qual canal ele é.
      campaigns: { some: { status: "awaiting_confirmation", ...scope } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

function propertyData(e: ExtractedProperty, sourceText: string) {
  return {
    title: e.title,
    description: e.description,
    propertyType: e.propertyType,
    transaction: e.transaction,
    price: e.price,
    city: e.city,
    neighborhood: e.neighborhood,
    bedrooms: e.bedrooms,
    suites: e.suites,
    bathrooms: e.bathrooms,
    parkingSpaces: e.parkingSpaces,
    areaM2: e.areaM2,
    attributes: {
      ...(e.audienceHint ? { audienceHint: e.audienceHint } : {}),
      ...(e.units.length ? { units: e.units.map((u) => ({ ...u })) } : {}),
    },
    sourceText,
  };
}

/** Baixa do provedor e guarda no nosso storage — não dependemos das URLs temporárias do webhook. */
export async function storeAsset(deps: AppDeps, tenantId: string, propertyId: string, media: InboundMedia, sourceMessageId: string) {
  const existing = await deps.db.propertyAsset.findUnique({ where: { tenantId_sourceMessageId: { tenantId, sourceMessageId } } });
  if (existing) return existing;
  const limit = Math.max(deps.config.MAX_IMAGE_BYTES, deps.config.MAX_DOCUMENT_BYTES);
  let buf: Buffer;
  try {
    buf = await deps.fetchMedia(media.url, limit);
  } catch (err) {
    if (err instanceof DomainError) throw err;
    throw new DomainError("file_unavailable", "Arquivo indisponível para download");
  }
  return saveAssetBuffer(deps, tenantId, propertyId, buf, media.fileName, sourceMessageId);
}

export async function saveAssetBuffer(
  deps: AppDeps,
  tenantId: string,
  propertyId: string,
  buf: Buffer,
  originalName: string | null,
  sourceMessageId: string | null,
) {
  const v = validateFile(buf, { maxImageBytes: deps.config.MAX_IMAGE_BYTES, maxDocumentBytes: deps.config.MAX_DOCUMENT_BYTES });
  const ext = v.mimeType === "application/pdf" ? "pdf" : v.mimeType === "image/png" ? "png" : "jpg";
  const key = `tenants/${tenantId}/properties/${propertyId}/${randomUUID()}.${ext}`;
  await deps.storage.put(key, buf, v.mimeType);
  const position = await deps.db.propertyAsset.count({ where: { tenantId, propertyId } });
  try {
    return await deps.db.propertyAsset.create({
      data: {
        tenantId,
        propertyId,
        kind: v.kind,
        storageKey: key,
        mimeType: v.mimeType,
        sizeBytes: v.sizeBytes,
        originalName: originalName?.slice(0, 200) ?? null,
        sha256: createHash("sha256").update(buf).digest("hex"),
        sourceMessageId,
        position,
      },
    });
  } catch (err) {
    await deps.storage.delete(key).catch(() => undefined);
    if (isUniqueViolation(err) && sourceMessageId) {
      return deps.db.propertyAsset.findUniqueOrThrow({ where: { tenantId_sourceMessageId: { tenantId, sourceMessageId } } });
    }
    throw err;
  }
}

function summary(
  p: Property,
  assets: { kind: string; _count: number }[],
  eligible: number,
  baseUrl: string,
  eta: string | null,
): string {
  const photos = assets.find((a) => a.kind === "image")?._count ?? 0;
  const pdfs = assets.find((a) => a.kind === "document")?._count ?? 0;
  const facts = [
    p.neighborhood && `📍 ${p.neighborhood}${p.city ? `, ${p.city}` : ""}`,
    p.bedrooms != null && `🛏 ${p.bedrooms} quarto(s)`,
    p.suites != null && `${p.suites} suíte(s)`,
    p.parkingSpaces != null && `🚗 ${p.parkingSpaces} vaga(s)`,
    p.areaM2 != null && `📐 ${Number(p.areaM2)} m²`,
  ].filter(Boolean);
  const missing = [!p.price && "valor", !p.propertyType && "tipo", !p.neighborhood && !p.city && "localização"].filter(Boolean);
  const units = unitsOf(p);
  return [
    "✅ *Imóvel recebido!*",
    `*${p.title ?? "Sem título"}*${p.price != null ? ` — ${units.length ? "a partir de " : ""}${formatBRL(Number(p.price))}` : ""}`,
    units.length ? units.map((u) => `• ${unitLine(u)}`).join("\n") : facts.join(" · "),
    units.length > 0 && p.neighborhood ? `📍 ${p.neighborhood}${p.city ? `, ${p.city}` : ""}` : null,
    `📎 ${photos} foto(s), ${pdfs} PDF(s)`,
    missing.length ? `ℹ️ Não informado: ${missing.join(", ")}` : null,
    `👥 Público estimado: *${eligible} contatos elegíveis*.`,
    eta ? `⏱ Envio em fila, previsão de ${eta}.` : null,
    "",
    "Campanha pronta para revisão. Responda *CONFIRMAR* para iniciar o envio ou *CANCELAR* para descartar.",
    `Para corrigir, envie o texto novamente ou edite no painel: ${baseUrl}`,
  ]
    .filter((l) => l !== null && l !== "")
    .join("\n");
}

function unitsOf(p: Property): PropertyUnit[] {
  const raw = (p.attributes as { units?: unknown } | null)?.units;
  return Array.isArray(raw) ? (raw as PropertyUnit[]) : [];
}

function unitLine(u: PropertyUnit): string {
  return [
    u.bedrooms != null && `${u.bedrooms} dorm`,
    u.suites != null && `${u.suites} suíte`,
    u.areaM2 != null && `${u.areaM2} m²`,
    u.price != null && formatBRL(u.price),
  ]
    .filter(Boolean)
    .join(" · ");
}

export async function sendReply(deps: AppDeps, account: ProviderAccount, to: string, text: string): Promise<void> {
  try {
    const adapter = await deps.outboundFor(account);
    await adapter.send(to, { kind: "text", text });
  } catch (err) {
    // Falha na resposta ao corretor não desfaz o processamento já feito.
    deps.logger.warn({ err: (err as Error).message, accountId: account.id }, "falha ao responder no canal de entrada");
  }
}
