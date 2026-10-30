import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Corretor opera a imobiliária; o administrador da plataforma (isSuper) só a área /admin. */
const AGENT_HOME = "/painel";
const ADMIN_HOME = "/admin/clientes";

function clearSession(response: NextResponse, secure: boolean): NextResponse {
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next") || pathname.startsWith("/images") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  // Route Handlers validam a sessão por conta própria (a API também valida token e perfil).
  if (pathname.startsWith("/api/")) return NextResponse.next();

  // Manual de uso pelo WhatsApp é público: quem só usa o WhatsApp pode não ter login no painel.
  if (pathname === "/manual" || pathname.startsWith("/manual/")) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const secure = request.nextUrl.protocol === "https:";
  const session = token ? await verifySessionToken(token) : null;
  const home = session?.isSuper ? ADMIN_HOME : AGENT_HOME;

  if (pathname === "/" || pathname.startsWith("/auth")) {
    return session ? NextResponse.redirect(new URL(home, request.url)) : NextResponse.next();
  }

  if (!session) {
    const response = NextResponse.redirect(new URL("/", request.url));
    return token ? clearSession(response, secure) : response;
  }

  const isAdminArea = pathname === "/admin" || pathname.startsWith("/admin/");
  if (isAdminArea !== Boolean(session.isSuper)) {
    return NextResponse.redirect(new URL(home, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
