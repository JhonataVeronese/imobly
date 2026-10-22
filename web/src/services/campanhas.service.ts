/**
 * Campanhas — telas `/campanhas` e `/campanhas/[id]`.
 * Backend: `{SAAS_API_BASE_URL}/campaigns` via BFF `/api/campaigns`.
 */
import { bffRequest, jsonInit } from "@/lib/api/bff-request";
import { NEXT_PROXY } from "@/lib/api/saas-endpoints";
import type {
  CampaignAction,
  CampaignDetail,
  CampaignListItem,
  ConfirmCampaignResult,
  MessageStatus,
  RecipientsPage,
} from "@/types/campanha";

const campaignUrl = (id: string) => `${NEXT_PROXY.campaigns}/${encodeURIComponent(id)}`;

export function getCampaign(id: string): Promise<CampaignDetail> {
  return bffRequest<CampaignDetail>(campaignUrl(id));
}

export function createCampaign(propertyId: string): Promise<CampaignListItem> {
  return bffRequest<CampaignListItem>(NEXT_PROXY.campaigns, jsonInit("POST", { propertyId }));
}

/** Confirmação é idempotente na API: repetir retorna `alreadyConfirmed: true`. */
export function runCampaignAction(id: string, action: CampaignAction): Promise<ConfirmCampaignResult | CampaignDetail> {
  return bffRequest(`${campaignUrl(id)}/${action}`, { method: "POST" });
}

export function listRecipients(id: string, status: MessageStatus | null, page: number): Promise<RecipientsPage> {
  const qs = new URLSearchParams({ page: String(page) });
  if (status) qs.set("status", status);
  return bffRequest<RecipientsPage>(`${campaignUrl(id)}/recipients?${qs.toString()}`);
}
