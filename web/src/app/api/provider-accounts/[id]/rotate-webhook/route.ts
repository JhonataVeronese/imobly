import { NextResponse } from "next/server";

import { SAAS } from "@/lib/api/saas-endpoints";
import { proxySaasRequest, uuidParamOr400 } from "@/lib/server/saas-proxy";

type RouteContext = { params: Promise<{ id: string }> };

/** Proxy: `POST {IMOBLY_API_URL}/provider-accounts/:id/rotate-webhook` */
export async function POST(_request: Request, context: RouteContext) {
  const id = uuidParamOr400((await context.params).id);
  if (id instanceof NextResponse) return id;
  return proxySaasRequest(`${SAAS.providerAccounts}/${id}/rotate-webhook`, { method: "POST" });
}
