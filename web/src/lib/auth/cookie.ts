/**
 * Cookies com `secure: true` não são gravados nem enviados em HTTP (ex.: localhost com `next start`).
 * Usar `secure` apenas quando a requisição vier por HTTPS.
 */
export function shouldUseSecureCookie(requestUrl: string | URL): boolean {
  try {
    return new URL(requestUrl).protocol === "https:";
  } catch {
    return false;
  }
}
