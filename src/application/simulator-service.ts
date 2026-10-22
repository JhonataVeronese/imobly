import { randomUUID } from "node:crypto";
import type { ProviderAccount } from "@prisma/client";
import { CAMPAIGN_STATUS_LABEL } from "../domain/campaign.js";
import { DomainError, NotFoundError } from "../domain/errors.js";
import type { ContactPreferences } from "../domain/audience.js";
import { SANDBOX_CONTACT_SOURCE, SIMULATOR_PROVIDER } from "../domain/sandbox.js";
import type { SimulatorEntry, SimulatorLogPort } from "../ports/infra.js";
import { campaignMetrics, sendEstimate } from "./campaign-service.js";
import { grantConsent, isSuppressed } from "./consent-service.js";
import type { AppDeps } from "./deps.js";
import { generateWebhookToken, ingestWebhook } from "./webhook-intake.js";

/**
 * Simulador do painel: conversa de WhatsApp de mentira passando pelo fluxo de verdade.
 * O que o usuário digita vira um webhook no formato da Z-API (entra por ingestWebhook, vai
 * para a fila de entrada, worker, comandos, campanha, fila de envio). O número do simulador
 * só envia para os contatos de teste abaixo e nada sai para o WhatsApp.
 */

interface SandboxContactSeed {
  name: string;
  phone: string;
  preferences: ContactPreferences;
  note: string;
}

/** Perfis variados para mostrar o casamento imóvel × cliente. O final 0001 simula "número sem WhatsApp". */
export const SANDBOX_CONTACTS: SandboxContactSeed[] = [
  {
    name: "Ana (teste)",
    phone: "+5511900001101",
    preferences: { propertyTypes: ["apartamento"], neighborhoods: ["Centro"], priceMax: 600000, bedroomsMin: 2 },
    note: "Apartamento no Centro, até R$ 600 mil, 2+ quartos",
  },
  {
    name: "Bruno (teste)",
    phone: "+5511900001102",
    preferences: { propertyTypes: ["casa"], priceMax: 1000000 },
    note: "Só casas, até R$ 1 milhão",
  },
  {
    name: "Carla (teste)",
    phone: "+5511900001103",
    preferences: { investor: true },
    note: "Investidora, aceita qualquer imóvel",
  },
  {
    name: "Diego (teste)",
    phone: "+5511900001104",
    preferences: { propertyTypes: ["apartamento"], priceMax: 300000 },
    note: "Apartamento até R$ 300 mil",
  },
  {
    name: "Eva (teste, sem WhatsApp)",
    phone: "+5511900000001",
    preferences: {},
    note: "Sem preferências; o número não tem WhatsApp (falha simulada)",
  },
];

const EVIDENCE = "simulador:contato-ficticio";
const MAX_UPLOAD_PREVIEW = 1_500_000;

function log(deps: AppDeps): SimulatorLogPort {
  if (!deps.simulator) throw new DomainError("simulator_disabled", "Simulador indisponível neste ambiente", 503);
  return deps.simulator;
}

async function sandboxAccount(deps: AppDeps, tenantId: string): Promise<ProviderAccount | null> {
  return deps.db.providerAccount.findFirst({ where: { tenantId, provider: SIMULATOR_PROVIDER } });
}

/** O corretor do simulador é o próprio usuário logado: precisa do telefone cadastrado, como no WhatsApp real. */
async function agentPhone(deps: AppDeps, tenantId: string, userId: string): Promise<string> {
  const user = await deps.db.user.findFirst({ where: { id: userId, tenantId } });
  if (!user) throw new NotFoundError("Usuário");
  if (!user.phoneE164) {
    throw new DomainError(
      "agent_phone_required",
      "Cadastre o seu telefone em Configurações → Usuários. É ele que identifica o corretor no WhatsApp (e no simulador).",
      409,
    );
  }
  return user.phoneE164.replace(/\D/g, "");
}

/** Cria (uma vez) o número do simulador e os contatos de teste com consentimento. Idempotente. */
export async function ensureSandbox(deps: AppDeps, tenantId: string, userId: string) {
  const phone = await agentPhone(deps, tenantId, userId);
  let account = await sandboxAccount(deps, tenantId);
  if (!account) {
    account = await deps.db.providerAccount.create({
      data: {
        tenantId,
        provider: SIMULATOR_PROVIDER,
        accountReference: `sim-${tenantId.slice(0, 8)}`,
        // Conversa direta: quem é corretor cadastrado conversa com o bot; o resto é cliente.
        inboundMode: "direct",
        // Nunca recebe webhook externo: o token é descartado na hora.
        webhookTokenHash: generateWebhookToken().hash,
      },
    });
  }
  for (const c of SANDBOX_CONTACTS) {
    const existing = await deps.db.contact.findFirst({ where: { tenantId, phoneE164: c.phone } });
    if (existing) continue; // inclusive se for um contato real com esse número: não mexe
    const contact = await deps.db.contact.create({
      data: { tenantId, name: c.name, phoneE164: c.phone, source: SANDBOX_CONTACT_SOURCE, preferences: c.preferences, tags: ["simulador"] },
    });
    await grantConsent(deps.db, tenantId, contact.id, { source: SANDBOX_CONTACT_SOURCE, evidenceReference: EVIDENCE }, { type: "system" });
  }
  return { account, agentPhone: phone };
}

function zapiPayload(account: ProviderAccount, from: string, senderName: string, extra: Record<string, unknown>) {
  return {
    type: "ReceivedCallback",
    instanceId: account.accountReference,
    messageId: `SIMUI-${randomUUID()}`,
    phone: from,
    isGroup: false,
    fromMe: false,
    momment: Date.now(),
    participantPhone: null,
    senderName,
    ...extra,
  };
}

export interface SimulatorUpload {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

/** Mensagem do corretor para o bot (texto e/ou um arquivo), pelo caminho de um webhook real. */
export async function sendAsAgent(deps: AppDeps, tenantId: string, userId: string, text: string | null, file: SimulatorUpload | null) {
  const { account, agentPhone: phone } = await ensureSandbox(deps, tenantId, userId);
  if (!text?.trim() && !file) throw new DomainError("empty_message", "Escreva uma mensagem ou anexe um arquivo");

  let extra: Record<string, unknown> = { text: { message: text ?? "" } };
  let media: string | null = null;
  const kind = file ? (file.mimeType === "application/pdf" || file.fileName.toLowerCase().endsWith(".pdf") ? "document" : "image") : "text";
  if (file) {
    // O worker baixa a mídia como faria com a URL temporária da Z-API.
    const ext = kind === "document" ? "pdf" : file.mimeType === "image/png" ? "png" : "jpg";
    const key = `simulator/${tenantId}/${randomUUID()}.${ext}`;
    await deps.storage.put(key, file.buffer, file.mimeType);
    const url = await deps.storage.signedUrl(key, 3600);
    extra =
      kind === "document"
        ? { document: { documentUrl: url, mimeType: file.mimeType, fileName: file.fileName, caption: text || undefined } }
        : { image: { imageUrl: url, mimeType: file.mimeType, caption: text || undefined } };
    if (file.buffer.length <= MAX_UPLOAD_PREVIEW && kind === "image") media = `data:${file.mimeType};base64,${file.buffer.toString("base64")}`;
  }

  await log(deps).push(tenantId, {
    direction: "in",
    chat: phone,
    kind,
    text: text?.trim() || null,
    fileName: file && kind === "document" ? file.fileName : null,
    media,
    providerMessageId: null,
    error: null,
  });
  return ingestWebhook(deps, account, zapiPayload(account, phone, "Você (corretor)", extra));
}

/** Resposta de um contato de teste (ex.: SAIR, VOLTAR, "tenho interesse"). */
export async function sendAsContact(deps: AppDeps, tenantId: string, userId: string, contactId: string, text: string) {
  const { account } = await ensureSandbox(deps, tenantId, userId);
  const contact = await deps.db.contact.findFirst({ where: { id: contactId, tenantId, source: SANDBOX_CONTACT_SOURCE } });
  if (!contact) throw new NotFoundError("Contato de teste");
  if (!text.trim()) throw new DomainError("empty_message", "Escreva uma mensagem");
  const phone = contact.phoneE164.replace(/\D/g, "");
  await log(deps).push(tenantId, {
    direction: "in",
    chat: phone,
    kind: "text",
    text: text.trim(),
    fileName: null,
    media: null,
    providerMessageId: null,
    error: null,
  });
  return ingestWebhook(deps, account, zapiPayload(account, phone, contact.name, { text: { message: text.trim() } }));
}

/** Estado da tela: conversa (incremental por `after`), status das mensagens, contatos e a fila do número. */
export async function conversation(deps: AppDeps, tenantId: string, userId: string, after = 0) {
  const { account, agentPhone: phone } = await ensureSandbox(deps, tenantId, userId);
  const entries: SimulatorEntry[] = await log(deps).list(tenantId, after);

  // Status de entrega das mensagens enviadas aos clientes (o provedor simulado avança sozinho).
  const ids = (await log(deps).list(tenantId, 0)).flatMap((e) => (e.direction === "out" && e.providerMessageId ? [e.providerMessageId] : []));
  const parts = ids.length
    ? await deps.db.recipientMessage.findMany({ where: { tenantId, providerMessageId: { in: ids } }, select: { providerMessageId: true, status: true } })
    : [];
  const statuses = Object.fromEntries(parts.map((p) => [p.providerMessageId!, p.status]));

  const contacts = await deps.db.contact.findMany({
    where: { tenantId, source: SANDBOX_CONTACT_SOURCE },
    orderBy: { createdAt: "asc" },
    include: { consents: { where: { revokedAt: null }, select: { id: true } } },
  });
  const contactsOut = [];
  for (const c of contacts) {
    const suppressed = await isSuppressed(deps.db, tenantId, c.phoneE164);
    contactsOut.push({
      id: c.id,
      name: c.name,
      phone: c.phoneE164.replace(/\D/g, ""),
      profile: SANDBOX_CONTACTS.find((s) => s.phone === c.phoneE164)?.note ?? null,
      canReceive: c.status === "active" && c.consents.length > 0 && !suppressed,
    });
  }

  const campaign = await deps.db.campaign.findFirst({ where: { tenantId, providerAccountId: account.id }, orderBy: { createdAt: "desc" } });
  let queue = null;
  if (campaign) {
    const m = await campaignMetrics(deps.db, tenantId, campaign.id);
    queue = {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      statusLabel: CAMPAIGN_STATUS_LABEL[campaign.status],
      eligible: campaign.eligibleCount,
      queued: m.queued,
      accepted: m.accepted,
      delivered: m.delivered,
      read: m.read,
      failed: m.failed,
      optOuts: m.optOuts,
      eta: campaign.status === "processing" ? (sendEstimate(deps, m.queued, SIMULATOR_PROVIDER)?.label ?? null) : null,
    };
  }

  return { agentPhone: phone, entries, statuses, contacts: contactsOut, campaign: queue };
}

/** Apaga tudo o que o simulador criou: conversa, campanhas, imóveis e contatos de teste (que voltam limpos). */
export async function resetSandbox(deps: AppDeps, tenantId: string) {
  await log(deps).clear(tenantId);
  const account = await sandboxAccount(deps, tenantId);
  if (!account) return { removedCampaigns: 0 };
  const campaigns = await deps.db.campaign.findMany({ where: { tenantId, providerAccountId: account.id }, select: { id: true, propertyId: true } });
  const campaignIds = campaigns.map((c) => c.id);
  const propertyIds = [...new Set(campaigns.map((c) => c.propertyId))];
  // Imóvel usado também por campanha real (não acontece pelo simulador, mas por garantia) fica.
  const shared = await deps.db.campaign.findMany({
    where: { tenantId, propertyId: { in: propertyIds }, NOT: { providerAccountId: account.id } },
    select: { propertyId: true },
  });
  const removable = propertyIds.filter((id) => !shared.some((s) => s.propertyId === id));
  const assets = await deps.db.propertyAsset.findMany({ where: { tenantId, propertyId: { in: removable } }, select: { storageKey: true } });
  const sandboxPhones = (await deps.db.contact.findMany({ where: { tenantId, source: SANDBOX_CONTACT_SOURCE }, select: { phoneE164: true } })).map(
    (c) => c.phoneE164,
  );

  await deps.db.$transaction([
    deps.db.recipientMessage.deleteMany({ where: { tenantId, recipient: { campaignId: { in: campaignIds } } } }),
    deps.db.campaignRecipient.deleteMany({ where: { tenantId, campaignId: { in: campaignIds } } }),
    deps.db.campaign.deleteMany({ where: { tenantId, id: { in: campaignIds } } }),
    deps.db.propertyAsset.deleteMany({ where: { tenantId, propertyId: { in: removable } } }),
    deps.db.property.deleteMany({ where: { tenantId, id: { in: removable } } }),
    deps.db.suppressionEntry.deleteMany({ where: { tenantId, phoneE164: { in: sandboxPhones } } }),
    deps.db.contactConsent.deleteMany({ where: { tenantId, contact: { source: SANDBOX_CONTACT_SOURCE } } }),
    deps.db.campaignRecipient.deleteMany({ where: { tenantId, contact: { source: SANDBOX_CONTACT_SOURCE } } }),
    deps.db.contact.deleteMany({ where: { tenantId, source: SANDBOX_CONTACT_SOURCE } }),
  ]);
  for (const a of assets) await deps.storage.delete(a.storageKey).catch(() => undefined);
  return { removedCampaigns: campaignIds.length };
}
