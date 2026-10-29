import { NextResponse } from "next/server";

import { SAAS } from "@/lib/api/saas-endpoints";
import { proxyJsonBody, uuidParamOr400 } from "@/lib/server/saas-proxy";

type RouteContext = { params: Promise<{ id: string }> };

/** Proxy: `PATCH {IMOBLY_API_URL}/users/:id` — nome e WhatsApp autorizado. */
export async function PATCH(request: Request, context: RouteContext) {
  const id = uuidParamOr400((await context.params).id);
  if (id instanceof NextResponse) return id;
  return proxyJsonBody(request, `${SAAS.users}/${id}`, "PATCH");
}
