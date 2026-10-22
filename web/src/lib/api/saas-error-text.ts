/**
 * A API SAAS costuma responder erros como JSON `{ "error": "mensagem" }`.
 * Se o proxy repassava o corpo inteiro como string no campo `error`, o cliente via JSON escapado duas vezes.
 */

/** Corpo textual (JSON ou texto) retornado em `!res.ok` pelo `fetch` à API principal. */
export function errorMessageFromSaasBodyText(raw: string, depth = 0): string {
  if (depth > 4) return raw.trim();
  const t = raw.trim();
  if (!t) return "";
  try {
    const parsed = JSON.parse(t) as { error?: unknown; message?: unknown };
    if (typeof parsed.message === "string") return parsed.message;
    if (typeof parsed.error === "string") {
      const err = parsed.error.trim();
      if (err.startsWith("{")) {
        const inner = errorMessageFromSaasBodyText(err, depth + 1);
        if (inner) return inner;
      }
      return parsed.error;
    }
  } catch {
    return t;
  }
  return t;
}

/** Payload já em objeto após `res.json()` do BFF (`{ error?: string }`). */
export function messageFromSaasErrorPayload(
  raw: unknown,
  fallback: string,
): string {
  if (!raw || typeof raw !== "object") return fallback;
  const e = (raw as { error?: unknown }).error;
  if (typeof e !== "string" || !e.trim()) return fallback;
  if (e.trim().startsWith("{")) {
    const parsed = errorMessageFromSaasBodyText(e);
    return parsed || e;
  }
  return e;
}
