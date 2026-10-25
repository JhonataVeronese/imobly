import { SAAS } from "@/lib/api/saas-endpoints";
import { parseListResponse } from "@/lib/api/parse-list-response";
import { errorMessageFromSaasBodyText } from "@/lib/api/saas-error-text";
import { saasFetch, isSaasApiConfigured } from "@/lib/server/saas-api";
import { connection } from "next/server";

export type SaasListStatus = "ok" | "unconfigured" | "error";

export type SaasListResult<T> =
  | { status: "ok"; data: T[] }
  | { status: "unconfigured"; data: T[] }
  | { status: "error"; data: T[]; message: string };

export type FetchSaasListOptions = {
  /** Cadastros por tenant e financeiro — exige `X-Tenant-Id`. */
  requireTenantId?: boolean;
  /** Rotas SUPER globais (planos, módulos, tenants). */
  skipTenantHeader?: boolean;
};

/**
 * Lista recursos na API principal (uso em Server Components / rotas server).
 * Não passa pelo proxy Next — evita URL relativa e repete a mesma lógica de headers do `saasFetch`.
 *
 * Sempre opta por render dinâmico: no build Docker `IMOBLY_API_URL` ainda não
 * existe e um early-return sem `cookies()`/`connection()` geraria HTML estático vazio.
 */
export async function fetchSaasList<T>(
  resourcePath: string,
  options?: FetchSaasListOptions,
): Promise<SaasListResult<T>> {
  await connection();

  if (!isSaasApiConfigured()) {
    return { status: "unconfigured", data: [] };
  }

  try {
    const res = await saasFetch(resourcePath, {
      method: "GET",
      requireTenantId: options?.requireTenantId,
      skipTenantHeader: options?.skipTenantHeader,
    });
    const text = await res.text();

    if (!res.ok) {
      const message = errorMessageFromSaasBodyText(text) || `HTTP ${res.status}`;
      return { status: "error", data: [], message };
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return {
        status: "error",
        data: [],
        message: "Resposta inválida (não é JSON).",
      };
    }

    return { status: "ok", data: parseListResponse<T>(raw) };
  } catch (e) {
    return {
      status: "error",
      data: [],
      message: e instanceof Error ? e.message : "Falha ao listar",
    };
  }
}

export { SAAS };

export type SaasResourceResult<T> =
  | { status: "ok"; data: T }
  | { status: "unconfigured"; data: null }
  | { status: "not_found"; data: null }
  | { status: "error"; data: null; message: string };

/** Busca um recurso único (detalhe) na API — mesmo tratamento de erros de `fetchSaasList`. */
export async function fetchSaasResource<T>(resourcePath: string): Promise<SaasResourceResult<T>> {
  await connection();
  if (!isSaasApiConfigured()) return { status: "unconfigured", data: null };

  try {
    const res = await saasFetch(resourcePath, { method: "GET", requireTenantId: true });
    const text = await res.text();
    if (res.status === 404) return { status: "not_found", data: null };
    if (!res.ok) return { status: "error", data: null, message: errorMessageFromSaasBodyText(text) || `HTTP ${res.status}` };
    return { status: "ok", data: JSON.parse(text) as T };
  } catch (e) {
    return { status: "error", data: null, message: e instanceof Error ? e.message : "Falha ao carregar" };
  }
}
