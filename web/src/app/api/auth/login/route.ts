import { NextResponse } from "next/server";

import { BackendAuthenticationError, loginOnBackend } from "@/lib/auth/backend-auth-login";
import { shouldUseSecureCookie } from "@/lib/auth/cookie";
import { SESSION_COOKIE, signSessionToken } from "@/lib/auth/jwt";
import { isSaasApiConfigured } from "@/lib/server/saas-api";

type Body = { email?: string; password?: string; senha?: string };

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const senha = (body.senha ?? body.password ?? "").trim();
  if (!email || !senha) {
    return NextResponse.json({ error: "Informe e-mail e senha." }, { status: 400 });
  }

  if (!isSaasApiConfigured()) {
    return NextResponse.json(
      { error: "API não configurada. Defina IMOBLY_API_URL no servidor." },
      { status: 503 },
    );
  }

  try {
    const login = await loginOnBackend(email, senha);
    const token = await signSessionToken({
      sub: login.sub,
      email: login.email,
      name: login.name,
      accessToken: login.accessToken,
      tenantHomeId: login.tenantHomeId,
      activeTenantId: login.tenantHomeId,
      isSuper: false,
      perfil: login.perfil,
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: shouldUseSecureCookie(request.url),
      sameSite: "lax",
      path: "/",
      // A API emite tokens de 12h; a sessão não deve sobreviver ao token interno.
      maxAge: 60 * 60 * 12,
    });
    return res;
  } catch (e) {
    const status = e instanceof BackendAuthenticationError ? 401 : 502;
    const message = e instanceof Error ? e.message : "Não foi possível autenticar.";
    return NextResponse.json({ error: message }, { status });
  }
}
