import { messageFromSaasErrorPayload } from "@/lib/api/saas-error-text";
import { saasClientFetch } from "@/lib/api/saas-client-fetch";

export class BffRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BffRequestError";
  }
}

/** Chamada ao BFF com parse de JSON e erro tipado (mensagem já legível para o usuário). */
export async function bffRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await saasClientFetch(url, { cache: "no-store", ...init });
  const raw = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    throw new BffRequestError(messageFromSaasErrorPayload(raw, `Erro ${res.status}`), res.status);
  }
  return raw as T;
}

export function jsonInit(method: "POST" | "PATCH", body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
