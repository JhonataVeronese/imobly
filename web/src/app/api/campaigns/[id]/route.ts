import { NextResponse } from "next/server";

import { SAAS } from "@/lib/api/saas-endpoints";
import { proxySaasRequest, uuidParamOr400 } from "@/lib/server/saas-proxy";

type RouteContext = { params: Promise<{ id: string }> };

/** Proxy: `GET {SAAS_API_BASE_URL}/campaigns/:id` (inclui métricas) */
export async function GET(_request: Request, context: RouteContext) {
  const id = uuidParamOr400((await context.params).id);
  if (id instanceof NextResponse) return id;
  return proxySaasRequest(`${SAAS.campaigns}/${id}`, { method: "GET", cache: "no-store" });
}
