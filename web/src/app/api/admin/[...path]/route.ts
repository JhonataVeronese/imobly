import { NextResponse } from "next/server";

import { forwardQuery, proxySaasRequest, readJsonBody } from "@/lib/server/saas-proxy";

type RouteContext = { params: Promise<{ path: string[] }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEGMENTS = new Set(["tenants", "users", "provider-accounts", "rotate-webhook", "webhook-events", "audit-logs"]);

/**
 * Proxy da área do administrador da plataforma: `/api/admin/...` → `{IMOBLY_API_URL}/admin/...`.
 * Só segmentos conhecidos ou UUIDs montam o caminho; a API exige o perfil platform_admin.
 */
async function adminPath(context: RouteContext): Promise<string | NextResponse> {
  const { path } = await context.params;
  if (!path.length || !path.every((s) => SEGMENTS.has(s) || UUID_RE.test(s))) {
    return NextResponse.json({ error: "Rota inválida" }, { status: 404 });
  }
  return `/admin/${path.join("/")}`;
}

const noTenant = { requireTenantId: false, skipTenantHeader: true } as const;

export async function GET(request: Request, context: RouteContext) {
  const path = await adminPath(context);
  if (path instanceof NextResponse) return path;
  return proxySaasRequest(`${path}${forwardQuery(request, ["limit"])}`, { method: "GET", cache: "no-store", ...noTenant });
}

async function withBody(request: Request, context: RouteContext, method: "POST" | "PATCH") {
  const path = await adminPath(context);
  if (path instanceof NextResponse) return path;
  const { body, error } = await readJsonBody(request);
  if (error) return error;
  return proxySaasRequest(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}), ...noTenant });
}

export async function POST(request: Request, context: RouteContext) {
  return withBody(request, context, "POST");
}

export async function PATCH(request: Request, context: RouteContext) {
  return withBody(request, context, "PATCH");
}
