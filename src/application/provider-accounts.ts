import { z } from "zod";
import { DomainError, NotFoundError } from "../domain/errors.js";
import { audit, type Actor, type AppDeps } from "./deps.js";
import { registerOmniAccount, rotateOmniWebhookUrl } from "./omni-setup.js";
import { generateWebhookToken } from "./webhook-intake.js";

export const providerAccountBody = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("zapi"),
    instanceId: z.string().min(5),
    instanceToken: z.string().min(5),
    clientToken: z.string().optional(),
    inboundMode: z.enum(["group", "direct"]).default("group"),
    inboundChatId: z.string().optional(),
  }),
  z.object({
    provider: z.literal("omni"),
    channelId: z.string().trim().min(8),
    secretKey: z.string().trim().min(10),
    inboundMode: z.enum(["group", "direct"]).default("direct"),
    inboundChatId: z.string().optional(),
  }),
  z.object({
    provider: z.literal("fake"),
    inboundMode: z.enum(["group", "direct"]).default("group"),
    inboundChatId: z.string().optional(),
  }),
]);

export const providerAccountUpdateBody = z.object({
  status: z.enum(["active", "disabled"]).optional(),
  inboundChatId: z.string().nullable().optional(),
  inboundMode: z.enum(["group", "direct"]).optional(),
});

export const providerAccountPublicFields = {
  id: true,
  provider: true,
  accountReference: true,
  status: true,
  inboundMode: true,
  inboundChatId: true,
  createdAt: true,
} as const;

/**
 * Configura a integração de um tenant. Credenciais vão cifradas para o cofre; a URL do webhook
 * (com token secreto) é retornada UMA vez — guardamos apenas o hash.
 */
export async function createProviderAccount(deps: AppDeps, tenantId: string, raw: unknown, actor: Actor) {
  const b = providerAccountBody.parse(raw);
  if (b.inboundMode === "group" && !b.inboundChatId) {
    throw new DomainError("inbound_chat_required", "Informe o id do grupo de entrada (inboundChatId), ex.: 1203...-group");
  }
  if (b.provider === "omni") {
    // O webhook é criado na Omni automaticamente (assinado); a URL não precisa ser configurada à mão.
    const { account, webhookUrl } = await registerOmniAccount(deps, tenantId, b, actor);
    const publicAccount = await deps.db.providerAccount.findUniqueOrThrow({ where: { id: account.id }, select: providerAccountPublicFields });
    return {
      ...publicAccount,
      webhookUrl,
      note: "Webhook cadastrado na Omni automaticamente, com assinatura. Não é preciso configurar nada no painel da Omni.",
    };
  }
  const { token, hash } = generateWebhookToken();
  const configurationRef =
    b.provider === "zapi" ? await deps.secrets.put(tenantId, { instanceToken: b.instanceToken, ...(b.clientToken ? { clientToken: b.clientToken } : {}) }) : null;
  const account = await deps.db.providerAccount.create({
    data: {
      tenantId,
      provider: b.provider,
      accountReference: b.provider === "zapi" ? b.instanceId : `fake-${tenantId.slice(0, 8)}`,
      inboundMode: b.inboundMode,
      inboundChatId: b.inboundChatId ?? null,
      webhookTokenHash: hash,
      configurationRef,
    },
    select: providerAccountPublicFields,
  });
  await audit(deps.db, tenantId, actor, "provider_account.created", "provider_account", account.id, { provider: b.provider });
  return {
    ...account,
    webhookUrl: `${deps.config.PUBLIC_BASE_URL}/webhooks/${b.provider}/${token}`,
    note: "Guarde esta URL: ela não será exibida novamente. Configure-a nos webhooks de recebimento e de status da instância.",
  };
}

export async function updateProviderAccount(deps: AppDeps, tenantId: string, id: string, raw: unknown, actor: Actor) {
  const b = providerAccountUpdateBody.parse(raw);
  const r = await deps.db.providerAccount.updateMany({ where: { id, tenantId }, data: b });
  if (!r.count) throw new NotFoundError("Integração");
  await audit(deps.db, tenantId, actor, "provider_account.updated", "provider_account", id, b);
  return deps.db.providerAccount.findFirstOrThrow({ where: { id, tenantId }, select: providerAccountPublicFields });
}

/** Rotaciona o token do webhook (ex.: suspeita de vazamento). */
export async function rotateProviderWebhook(deps: AppDeps, tenantId: string, id: string, actor: Actor) {
  const current = await deps.db.providerAccount.findFirst({ where: { id, tenantId } });
  if (!current) throw new NotFoundError("Integração");
  const { token, hash } = generateWebhookToken();
  const url = `${deps.config.PUBLIC_BASE_URL}/webhooks/${current.provider}/${token}`;
  if (current.provider === "omni" && current.configurationRef) {
    await rotateOmniWebhookUrl(deps, tenantId, current.accountReference, current.configurationRef, url);
  }
  await deps.db.providerAccount.updateMany({ where: { id, tenantId }, data: { webhookTokenHash: hash } });
  await audit(deps.db, tenantId, actor, "provider_account.webhook_rotated", "provider_account", id);
  return { webhookUrl: url };
}
