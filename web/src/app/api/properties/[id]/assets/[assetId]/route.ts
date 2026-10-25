import { NextResponse } from "next/server";

import { SAAS } from "@/lib/api/saas-endpoints";
import { proxySaasRequest, uuidParamOr400 } from "@/lib/server/saas-proxy";

type RouteContext = { params: Promise<{ id: string; assetId: string }> };

/** Proxy: `DELETE {IMOBLY_API_URL}/properties/:id/assets/:assetId` */
export async function DELETE(_request: Request, context: RouteContext) {
  const params = await context.params;
  const id = uuidParamOr400(params.id);
  if (id instanceof NextResponse) return id;
  const assetId = uuidParamOr400(params.assetId);
  if (assetId instanceof NextResponse) return assetId;
  return proxySaasRequest(`${SAAS.properties}/${id}/assets/${assetId}`, { method: "DELETE" });
}
