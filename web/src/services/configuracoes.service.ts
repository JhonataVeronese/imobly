/**
 * Integrações WhatsApp e usuários — telas `/configuracoes/*` (somente administradores).
 */
import { bffRequest, jsonInit } from "@/lib/api/bff-request";
import { NEXT_PROXY } from "@/lib/api/saas-endpoints";
import type { OmniAccountPayload, ProviderAccountCreated, UserCreatePayload, UserListItem, ZapiAccountPayload } from "@/types/configuracao";

export function createZapiAccount(payload: ZapiAccountPayload): Promise<ProviderAccountCreated> {
  return bffRequest<ProviderAccountCreated>(NEXT_PROXY.providerAccounts, jsonInit("POST", payload));
}

/** A API cria o webhook (assinado) na Omni sozinha: nada a configurar no painel da Omni. */
export function createOmniAccount(payload: OmniAccountPayload): Promise<ProviderAccountCreated> {
  return bffRequest<ProviderAccountCreated>(NEXT_PROXY.providerAccounts, jsonInit("POST", payload));
}

export function rotateWebhook(accountId: string): Promise<{ webhookUrl: string }> {
  return bffRequest(`${NEXT_PROXY.providerAccounts}/${encodeURIComponent(accountId)}/rotate-webhook`, { method: "POST" });
}

export function createUser(payload: UserCreatePayload): Promise<UserListItem> {
  return bffRequest<UserListItem>(NEXT_PROXY.users, jsonInit("POST", payload));
}

/** `phone: null` remove o WhatsApp (o usuário deixa de poder enviar imóveis pelo canal de entrada). */
export function updateUser(id: string, payload: { name: string; phone: string | null }): Promise<UserListItem> {
  return bffRequest<UserListItem>(`${NEXT_PROXY.users}/${encodeURIComponent(id)}`, jsonInit("PATCH", payload));
}
