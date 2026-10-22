import { appConfig } from "@/config/app-config";
import { SAAS } from "@/lib/api/saas-endpoints";
import { errorMessageFromSaasBodyText } from "@/lib/api/saas-error-text";
import {
  appendSaasApiKeyHeader,
  SaasApiConfigurationError,
} from "@/lib/server/saas-api";
import type { UsuarioPerfil } from "@/types/usuario";

export class BackendAuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackendAuthenticationError";
  }
}

export type NormalizedLogin = {
  accessToken: string;
  sub: string;
  email: string;
  name: string;
  tenantHomeId: string;
  tenantName: string;
  perfil: UsuarioPerfil;
};

type ApiLoginResponse = { token?: string; tenantId?: string; role?: string };
type ApiMeResponse = {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  tenant?: { id?: string; name?: string };
};

/** Papéis da API (owner/admin/agent) → perfis do template (admin/operador). */
export function perfilFromApiRole(role: string | undefined): UsuarioPerfil {
  return role === "owner" || role === "admin" ? "admin" : "operador";
}

async function postJson<T>(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; data: T | null; text: string }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: text ? (JSON.parse(text) as T) : null, text };
  } catch {
    return { ok: res.ok, status: res.status, data: null, text };
  }
}

/**
 * `POST {SAAS_API_BASE_URL}/auth/login` seguido de `GET /me` para obter nome,
 * e-mail e organização — a resposta do login traz apenas o token e o tenant.
 */
export async function loginOnBackend(email: string, password: string): Promise<NormalizedLogin> {
  const base = appConfig.saasApiBaseUrl;
  if (!base) throw new SaasApiConfigurationError("SAAS_API_BASE_URL não configurada");

  const headers = new Headers({ "Content-Type": "application/json" });
  appendSaasApiKeyHeader(headers);

  const login = await postJson<ApiLoginResponse>(`${base}${SAAS.authLogin}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  if (!login.ok) {
    throw new BackendAuthenticationError(errorMessageFromSaasBodyText(login.text) || `Erro ${login.status}`);
  }
  const token = login.data?.token;
  if (!token || !login.data?.tenantId) {
    throw new BackendAuthenticationError("Resposta de login sem token.");
  }

  const meHeaders = new Headers({ Authorization: `Bearer ${token}` });
  appendSaasApiKeyHeader(meHeaders);
  const me = await postJson<ApiMeResponse>(`${base}${SAAS.me}`, { method: "GET", headers: meHeaders });
  if (!me.ok || !me.data?.id) {
    throw new BackendAuthenticationError("Não foi possível carregar os dados do usuário.");
  }

  return {
    accessToken: token,
    sub: me.data.id,
    email: me.data.email ?? email,
    name: me.data.name ?? email,
    tenantHomeId: login.data.tenantId,
    tenantName: me.data.tenant?.name ?? "",
    perfil: perfilFromApiRole(me.data.role ?? login.data.role),
  };
}
