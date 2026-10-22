import { NextResponse } from "next/server";

import { SAAS } from "@/lib/api/saas-endpoints";
import { proxySaasRequest, uuidParamOr400 } from "@/lib/server/saas-proxy";
import { CAMPAIGN_ACTIONS, type CampaignAction } from "@/types/campanha";

type RouteContext = { params: Promise<{ id: string; action: string }> };

function isCampaignAction(value: string): value is CampaignAction {
  return (CAMPAIGN_ACTIONS as readonly string[]).includes(value);
}

/** Proxy: `POST {SAAS_API_BASE_URL}/campaigns/:id/(confirm|pause|resume|cancel)` */
export async function POST(_request: Request, context: RouteContext) {
  const params = await context.params;
  const id = uuidParamOr400(params.id);
  if (id instanceof NextResponse) return id;
  if (!isCampaignAction(params.action)) {
    return NextResponse.json({ error: "Ação inválida" }, { status: 404 });
  }
  return proxySaasRequest(`${SAAS.campaigns}/${id}/${params.action}`, { method: "POST" });
}
