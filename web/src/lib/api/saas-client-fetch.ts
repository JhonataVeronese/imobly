/**
 * Fetch ao BFF (`/api/*`) com cookie de sessão e redirecionamento em 401
 * (exceto na própria rota de login, para não criar loop).
 */

function isAuthLoginUrl(input: RequestInfo | URL): boolean {
  const url =
    typeof input === "string"
      ? input
      : input instanceof Request
        ? input.url
        : String(input);
  return url.includes("/api/auth/login");
}

export async function saasClientFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, {
    ...init,
    credentials: "include",
  });

  if (
    res.status === 401 &&
    typeof window !== "undefined" &&
    !isAuthLoginUrl(input)
  ) {
    window.location.assign("/");
  }

  return res;
}
