import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { errorMessageFromSaasBodyText } from "@/lib/api/saas-error-text";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/jwt";
import {
  isSaasApiConfigured,
  nextResponseMissingTenant,
  saasFetch,
  type SaasFetchInit,
} from "@/lib/server/saas-api";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unavailableResponse(): NextResponse {
  return NextResponse.json(
    { error: "API não configurada. Defina IMOBLY_API_URL no servidor." },
    { status: 503 },
  );
}

/**
 * Repassa a requisição à API do ImobZap com sessão e tenant.
 * Sucesso: corpo e status originais. Erro: `{ error: mensagem }` legível pelo cliente.
 */
export async function proxySaasRequest(path: string, init: SaasFetchInit): Promise<NextResponse> {
  if (!isSaasApiConfigured()) return unavailableResponse();
  // Sem sessão válida → 401 (o `saasClientFetch` redireciona ao login), antes de qualquer chamada à API.
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  }

  let response: Response;
  try {
    response = await saasFetch(path, { requireTenantId: true, ...init });
  } catch (error) {
    const missingTenant = nextResponseMissingTenant(error);
    if (missingTenant) return missingTenant;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao acessar a API." },
      { status: 502 },
    );
  }

  const body = await response.text();
  if (!response.ok) {
    const message = errorMessageFromSaasBodyText(body) || `Erro ${response.status}`;
    return NextResponse.json({ error: message }, { status: response.status });
  }
  if (!body) return new NextResponse(null, { status: response.status });

  const headers = new Headers();
  headers.set("content-type", response.headers.get("content-type") ?? "application/json");
  return new NextResponse(body, { status: response.status, headers });
}

/** Repassa um corpo JSON validado sintaticamente. */
export async function proxyJsonBody(request: Request, path: string, method: "POST" | "PATCH"): Promise<NextResponse> {
  const { body, error } = await readJsonBody(request);
  if (error) return error;
  return proxySaasRequest(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export async function readJsonBody(request: Request): Promise<{ body?: unknown; error?: NextResponse }> {
  const text = await request.text();
  if (!text) return { body: {} };
  try {
    return { body: JSON.parse(text) as unknown };
  } catch {
    return { error: NextResponse.json({ error: "JSON inválido" }, { status: 400 }) };
  }
}

/** Ids de rota são UUIDs — rejeita antes de montar o path da API. */
export function uuidParamOr400(raw: string): string | NextResponse {
  const id = raw.trim();
  return UUID_RE.test(id) ? id : NextResponse.json({ error: "Identificador inválido" }, { status: 400 });
}

/** Repassa apenas os parâmetros de consulta permitidos. */
export function forwardQuery(request: Request, allowed: readonly string[]): string {
  const source = new URL(request.url).searchParams;
  const target = new URLSearchParams();
  for (const key of allowed) {
    const value = source.get(key);
    if (value) target.set(key, value);
  }
  const qs = target.toString();
  return qs ? `?${qs}` : "";
}
