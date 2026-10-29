import { NextResponse } from "next/server";

import { SAAS } from "@/lib/api/saas-endpoints";
import { proxyJsonBody, proxySaasRequest, uuidParamOr400 } from "@/lib/server/saas-proxy";

type RouteContext = { params: Promise<{ id: string }> };

/** Proxy: `GET {IMOBLY_API_URL}/campaigns/:id` (inclui métricas) */
export async function GET(_request: Request, context: RouteContext) {
  const id = uuidParamOr400((await context.params).id);
  if (id instanceof NextResponse) return id;
  return proxySaasRequest(`${SAAS.campaigns}/${id}`, { method: "GET", cache: "no-store" });
}

/** Proxy: `PATCH {IMOBLY_API_URL}/campaigns/:id` — `{ contactIds }` escolhidos para a campanha */
export async function PATCH(request: Request, context: RouteContext) {
  const id = uuidParamOr400((await context.params).id);
  if (id instanceof NextResponse) return id;
  return proxyJsonBody(request, `${SAAS.campaigns}/${id}`, "PATCH");
}
