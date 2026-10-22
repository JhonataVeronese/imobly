/**
 * Contratos de caminho da API do ImobZap e dos proxies Next.js (BFF).
 * Base backend: `SAAS_API_BASE_URL` (sem barra final).
 */

/** Recursos na API do ImobZap (path relativo à base). */
export const SAAS = {
  authLogin: "/auth/login",
  me: "/me",
  users: "/users",
  providerAccounts: "/provider-accounts",
  webhookEvents: "/webhook-events",
  contacts: "/contacts",
  contactsImport: "/contacts/import",
  suppressionList: "/suppression-list",
  auditLogs: "/audit-logs",
  properties: "/properties",
  campaigns: "/campaigns",
  simulator: "/simulator",
} as const;

/** Rotas BFF Next (`/api/...`) usadas pelo navegador. */
export const NEXT_PROXY = {
  users: "/api/users",
  providerAccounts: "/api/provider-accounts",
  contacts: "/api/contacts",
  contactsImport: "/api/contacts/import",
  properties: "/api/properties",
  campaigns: "/api/campaigns",
  simulator: "/api/simulator",
} as const;

export type SaasResourceKey = keyof typeof SAAS;
