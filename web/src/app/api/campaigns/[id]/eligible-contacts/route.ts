import { NextResponse } from "next/server";

import { SAAS } from "@/lib/api/saas-endpoints";
import { forwardQuery, proxySaasRequest, uuidParamOr400 } from "@/lib/server/saas-proxy";

type RouteContext = { params: Promise<{ id: string }> };

/** Proxy: `GET {IMOBLY_API_URL}/campaigns/:id/eligible-contacts?page=&q=` */
export async function GET(request: Request, context: RouteContext) {
  const id = uuidParamOr400((await context.params).id);
  if (id instanceof NextResponse) return id;
  const query = forwardQuery(request, ["page", "q"]);
  return proxySaasRequest(`${SAAS.campaigns}/${id}/eligible-contacts${query}`, { method: "GET", cache: "no-store" });
}
