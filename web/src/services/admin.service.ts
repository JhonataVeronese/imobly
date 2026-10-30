/**
 * Área do administrador da plataforma — `/admin/clientes`.
 * Backend: `{IMOBLY_API_URL}/admin/tenants/...` via BFF `/api/admin/...`.
 */
import { bffRequest, jsonInit } from "@/lib/api/bff-request";
import { NEXT_PROXY } from "@/lib/api/saas-endpoints";
import type {
  AdminTenant,
  OmniAccountPayload,
  ProviderAccount,
  ProviderAccountCreated,
  TenantCreatePayload,
  TenantUpdatePayload,
  UserCreatePayload,
  UserListItem,
  UserUpdatePayload,
  ZapiAccountPayload,
} from "@/types/configuracao";

const tenantUrl = (tenantId: string) => `${NEXT_PROXY.adminTenants}/${encodeURIComponent(tenantId)}`;

export function createTenant(payload: TenantCreatePayload): Promise<AdminTenant> {
  return bffRequest<AdminTenant>(NEXT_PROXY.adminTenants, jsonInit("POST", payload));
}

export function updateTenant(tenantId: string, payload: TenantUpdatePayload): Promise<AdminTenant> {
  return bffRequest<AdminTenant>(tenantUrl(tenantId), jsonInit("PATCH", payload));
}

export function createUser(tenantId: string, payload: UserCreatePayload): Promise<UserListItem> {
  return bffRequest<UserListItem>(`${tenantUrl(tenantId)}/users`, jsonInit("POST", payload));
}

/** `phone: null` remove o WhatsApp (o corretor deixa de poder enviar imóveis pelo canal de entrada). */
export function updateUser(tenantId: string, userId: string, payload: UserUpdatePayload): Promise<UserListItem> {
  return bffRequest<UserListItem>(`${tenantUrl(tenantId)}/users/${encodeURIComponent(userId)}`, jsonInit("PATCH", payload));
}

export function createZapiAccount(tenantId: string, payload: ZapiAccountPayload): Promise<ProviderAccountCreated> {
  return bffRequest<ProviderAccountCreated>(`${tenantUrl(tenantId)}/provider-accounts`, jsonInit("POST", payload));
}

/** A API cria o webhook (assinado) na Omni sozinha: nada a configurar no painel da Omni. */
export function createOmniAccount(tenantId: string, payload: OmniAccountPayload): Promise<ProviderAccountCreated> {
  return bffRequest<ProviderAccountCreated>(`${tenantUrl(tenantId)}/provider-accounts`, jsonInit("POST", payload));
}

export function setProviderAccountStatus(tenantId: string, accountId: string, status: "active" | "disabled"): Promise<ProviderAccount> {
  return bffRequest<ProviderAccount>(`${tenantUrl(tenantId)}/provider-accounts/${encodeURIComponent(accountId)}`, jsonInit("PATCH", { status }));
}

export function rotateWebhook(tenantId: string, accountId: string): Promise<{ webhookUrl: string }> {
  return bffRequest(`${tenantUrl(tenantId)}/provider-accounts/${encodeURIComponent(accountId)}/rotate-webhook`, { method: "POST" });
}
