import { NextResponse } from "next/server";

import { SAAS } from "@/lib/api/saas-endpoints";
import { proxyJsonBody, uuidParamOr400 } from "@/lib/server/saas-proxy";

type RouteContext = { params: Promise<{ id: string }> };

/** Proxy: `POST {SAAS_API_BASE_URL}/contacts/:id/opt-out` */
export async function POST(request: Request, context: RouteContext) {
  const id = uuidParamOr400((await context.params).id);
  if (id instanceof NextResponse) return id;
  return proxyJsonBody(request, `${SAAS.contacts}/${id}/opt-out`, "POST");
}
