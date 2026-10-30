/**
 * Contratos de caminho da API do ImobZap e dos proxies Next.js (BFF).
 * Base backend: `IMOBLY_API_URL` (sem barra final).
 */

/** Recursos na API do ImobZap (path relativo à base). */
export const SAAS = {
  authLogin: "/auth/login",
  me: "/me",
  providerAccounts: "/provider-accounts",
  /** Área do administrador da plataforma (clientes, corretores, conexões). */
  adminTenants: "/admin/tenants",
  contacts: "/contacts",
  contactsImport: "/contacts/import",
  suppressionList: "/suppression-list",
  properties: "/properties",
  campaigns: "/campaigns",
  simulator: "/simulator",
} as const;

/** Rotas BFF Next (`/api/...`) usadas pelo navegador. */
export const NEXT_PROXY = {
  adminTenants: "/api/admin/tenants",
  contacts: "/api/contacts",
  contactsImport: "/api/contacts/import",
  properties: "/api/properties",
  campaigns: "/api/campaigns",
  simulator: "/api/simulator",
} as const;

export type SaasResourceKey = keyof typeof SAAS;
