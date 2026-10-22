import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SAAS } from "@/lib/api/saas-endpoints";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/jwt";
import { isSaasApiConfigured, saasFetch } from "@/lib/server/saas-api";
import type { AuthMe } from "@/types/auth-session";

export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let tenantName: string | null = null;
  if (isSaasApiConfigured()) {
    const res = await saasFetch(SAAS.me, { method: "GET" }).catch(() => null);
    // Token interno expirado/revogado: a sessão do front também deixa de valer.
    if (res?.status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (res?.ok) {
      const data = (await res.json()) as { tenant?: { name?: string } };
      tenantName = data.tenant?.name ?? null;
    }
  }

  const me: AuthMe = {
    email: session.email,
    name: session.name,
    sub: session.sub,
    isSuper: false,
    perfil: session.perfil ?? null,
    tenantHomeId: session.tenantHomeId ?? null,
    activeTenantId: session.activeTenantId ?? null,
    tenantName,
    moduloCodigos: [],
  };
  return NextResponse.json(me);
}
