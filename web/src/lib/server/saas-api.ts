/**
 * Cliente HTTP server-side para a API principal (backend Saas).
 * - `X-SAAS-API-Token`: chave da aplicação (mesmo valor de `IMOBLY_API_TOKEN` no env), exigida pelo middleware da API.
 * - `Authorization: Bearer`: JWT da sessão ou, sem sessão, `IMOBLY_API_TOKEN` como Bearer (quando aplicável).
 * - `X-Tenant-Id`: escopo de tenant quando exigido.
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { appConfig } from "@/config/app-config";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/jwt";

function getBaseUrl(): string | null {
  return appConfig.saasApiBaseUrl;
}

export function isSaasApiConfigured(): boolean {
  return getBaseUrl() !== null;
}

/** Quando `true`, não envia `X-Tenant-Id` (ex.: conta de serviço sem escopo). */
export function shouldSendXTenantIdHeader(): boolean {
  return appConfig.shouldSendTenantHeader;
}

/**
 * `X-Tenant-Id`: sessão (`activeTenantId` / `tenantHomeId`) ou env `IMOBLY_API_TENANT_ID`.
 */
function resolveXTenantId(
  session: Awaited<ReturnType<typeof verifySessionToken>>,
): string | null {
  const envTenant = appConfig.saasApiTenantId;
  if (!session) return envTenant || null;
  const fromSession =
    session.activeTenantId?.trim() ||
    session.tenantHomeId?.trim() ||
    null;
  return fromSession || envTenant || null;
}

/** Chave da aplicação (deve coincidir com `IMOBLY_API_TOKEN` no servidor da API). */
export function appendSaasApiKeyHeader(headers: Headers): void {
  const token = appConfig.saasApiToken;
  if (token) {
    headers.set("X-SAAS-API-Token", token);
  }
}

/** Sessão sem tenant resolvido para rotas que exigem `X-Tenant-Id`. */
export class SaasMissingTenantIdError extends Error {
  readonly code = "MISSING_TENANT_ID" as const;
  constructor(
    message = "Parceiro obrigatório: faça login com um parceiro selecionado ou defina IMOBLY_API_TENANT_ID no servidor.",
  ) {
    super(message);
    this.name = "SaasMissingTenantIdError";
  }
}

export class SaasApiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaasApiConfigurationError";
  }
}

export function isSaasMissingTenantIdError(
  e: unknown,
): e is SaasMissingTenantIdError {
  return e instanceof SaasMissingTenantIdError;
}

/** Resposta 400 para proxies quando não há tenant em rotas `requireTenantId`. */
export function nextResponseMissingTenant(e: unknown): NextResponse | null {
  if (!isSaasMissingTenantIdError(e)) return null;
  return NextResponse.json(
    { error: e.message, code: e.code },
    { status: 400 },
  );
}

/** Opções extras além de `RequestInit` (não repassadas ao `fetch` nativo). */
export type SaasFetchInit = RequestInit & {
  /**
   * Não envia `X-Tenant-Id` (ex.: `GET /tenants` para listagem global na tela de login).
   * Evita filtrar por `IMOBLY_API_TENANT_ID` quando ainda não há sessão.
   */
  skipTenantHeader?: boolean;
  /**
   * Não envia `Authorization` (ex.: `GET /public/tenants` — só `X-SAAS-API-Token`).
   */
  skipAuthorization?: boolean;
  /**
   * Cadastros por tenant e financeiro: exige `X-Tenant-Id` (sessão ou env).
   * Ignora `IMOBLY_SKIP_TENANT_HEADER` para esta requisição.
   */
  requireTenantId?: boolean;
};

export async function saasFetch(
  path: string,
  init?: SaasFetchInit,
): Promise<Response> {
  const base = getBaseUrl();
  if (!base) {
    throw new SaasApiConfigurationError("IMOBLY_API_URL não configurada");
  }

  const {
    skipTenantHeader,
    skipAuthorization,
    requireTenantId,
    ...restInit
  } = init ?? {};

  const url = path.startsWith("http")
    ? path
    : `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  const headers = new Headers(restInit.headers);

  const cookieStore = await cookies();
  const sessionJwt = cookieStore.get(SESSION_COOKIE)?.value;
  const session = sessionJwt
    ? await verifySessionToken(sessionJwt)
    : null;

  if (!skipAuthorization) {
    if (session?.accessToken) {
      headers.set("Authorization", `Bearer ${session.accessToken}`);
    } else {
      const serviceToken = appConfig.saasApiToken;
      if (serviceToken) {
        headers.set("Authorization", `Bearer ${serviceToken}`);
      }
    }
  }

  if (!skipTenantHeader) {
    const tenantId = resolveXTenantId(session)?.trim() || null;
    if (requireTenantId) {
      if (!tenantId) {
        throw new SaasMissingTenantIdError();
      }
      if (!headers.has("X-Tenant-Id")) {
        headers.set("X-Tenant-Id", tenantId);
      }
    } else if (shouldSendXTenantIdHeader() && tenantId && !headers.has("X-Tenant-Id")) {
      headers.set("X-Tenant-Id", tenantId);
    }
  }

  appendSaasApiKeyHeader(headers);

  return fetch(url, {
    ...restInit,
    headers,
    signal: restInit.signal ?? AbortSignal.timeout(10_000),
  });
}
