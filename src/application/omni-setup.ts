import type { InboundMode } from "@prisma/client";
import { DomainError } from "../domain/errors.js";
import { OmniClient } from "../infra/omni/omni-client.js";
import { ProviderError } from "../ports/outbound.js";
import { audit, type Actor, type AppDeps } from "./deps.js";
import { generateWebhookToken } from "./webhook-intake.js";

export interface OmniAccountInput {
  channelId: string;
  secretKey: string;
  inboundMode: InboundMode;
  inboundChatId?: string | null;
}

function client(deps: AppDeps, channelId: string, secretKey: string): OmniClient {
  if (!deps.omni) throw new DomainError("omni_unavailable", "Integração Omni indisponível neste ambiente", 503);
  return new OmniClient({ channelId, secretKey }, deps.omni.baseUrl, deps.omni.timeoutMs, deps.omni.fetchImpl);
}

function setupError(err: unknown): DomainError {
  if (!(err instanceof ProviderError)) return new DomainError("omni_setup_failed", "Falha ao falar com a Omni Z-API", 502);
  if (err.kind === "account_restricted") {
    return new DomainError("omni_credentials", "A Omni recusou a Secret Key ou o canal. Confira o Channel ID e a Secret Key (menu Segurança).", 422);
  }
  return new DomainError(
    "omni_setup_failed",
    `A Omni não aceitou o webhook (${err.code}). A URL pública da API (PUBLIC_BASE_URL) precisa ser acessível pela internet.`,
    502,
  );
}

/**
 * Cadastra um canal da Omni Z-API: cria na Omni o webhook (assinado, formato Z-API) apontando para
 * a nossa URL com token secreto, e guarda Secret Key + segredo da assinatura cifrados no cofre.
 */
export async function registerOmniAccount(deps: AppDeps, tenantId: string, input: OmniAccountInput, actor: Actor) {
  const { token, hash } = generateWebhookToken();
  const webhookUrl = `${deps.config.PUBLIC_BASE_URL}/webhooks/omni/${token}`;
  let webhook;
  try {
    webhook = await client(deps, input.channelId, input.secretKey).createWebhook(webhookUrl);
  } catch (err) {
    throw setupError(err);
  }
  const configurationRef = await deps.secrets.put(tenantId, {
    secretKey: input.secretKey,
    webhookId: webhook.id,
    ...(webhook.secret ? { webhookSecret: webhook.secret } : {}),
  });
  const account = await deps.db.providerAccount.create({
    data: {
      tenantId,
      provider: "omni",
      accountReference: input.channelId,
      inboundMode: input.inboundMode,
      inboundChatId: input.inboundChatId ?? null,
      webhookTokenHash: hash,
      configurationRef,
    },
  });
  await audit(deps.db, tenantId, actor, "provider_account.created", "provider_account", account.id, {
    provider: "omni",
    webhookSigned: !!webhook.secret,
  });
  return { account, webhookUrl };
}

/** Rotação do token da URL: atualiza a URL no webhook da Omni antes de trocar o hash local. */
export async function rotateOmniWebhookUrl(deps: AppDeps, tenantId: string, channelId: string, configurationRef: string, newUrl: string) {
  const s = await deps.secrets.get(tenantId, configurationRef);
  if (!s.webhookId) throw new DomainError("omni_no_webhook", "Integração Omni sem webhook cadastrado: recadastre o canal.", 409);
  try {
    await client(deps, channelId, s.secretKey!).updateWebhookUrl(s.webhookId, newUrl);
  } catch (err) {
    throw setupError(err);
  }
}
