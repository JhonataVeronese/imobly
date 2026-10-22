/**
 * Integrações WhatsApp e usuários — telas `/configuracoes/*` (somente administradores).
 */
import { bffRequest, jsonInit } from "@/lib/api/bff-request";
import { NEXT_PROXY } from "@/lib/api/saas-endpoints";
import type { ProviderAccountCreated, UserCreatePayload, UserListItem, ZapiAccountPayload } from "@/types/configuracao";

export function createZapiAccount(payload: ZapiAccountPayload): Promise<ProviderAccountCreated> {
  return bffRequest<ProviderAccountCreated>(NEXT_PROXY.providerAccounts, jsonInit("POST", payload));
}

export function rotateWebhook(accountId: string): Promise<{ webhookUrl: string }> {
  return bffRequest(`${NEXT_PROXY.providerAccounts}/${encodeURIComponent(accountId)}/rotate-webhook`, { method: "POST" });
}

export function createUser(payload: UserCreatePayload): Promise<UserListItem> {
  return bffRequest<UserListItem>(NEXT_PROXY.users, jsonInit("POST", payload));
}
