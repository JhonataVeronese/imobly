import { NextResponse } from "next/server";

import { SAAS } from "@/lib/api/saas-endpoints";
import { proxyJsonBody, proxySaasRequest, uuidParamOr400 } from "@/lib/server/saas-proxy";

type RouteContext = { params: Promise<{ id: string }> };

/** Proxy: `GET {SAAS_API_BASE_URL}/properties/:id` (com URLs temporárias dos arquivos) */
export async function GET(_request: Request, context: RouteContext) {
  const id = uuidParamOr400((await context.params).id);
  if (id instanceof NextResponse) return id;
  return proxySaasRequest(`${SAAS.properties}/${id}`, { method: "GET", cache: "no-store" });
}

/** Proxy: `PATCH {SAAS_API_BASE_URL}/properties/:id` — correção dos dados extraídos. */
export async function PATCH(request: Request, context: RouteContext) {
  const id = uuidParamOr400((await context.params).id);
  if (id instanceof NextResponse) return id;
  return proxyJsonBody(request, `${SAAS.properties}/${id}`, "PATCH");
}
