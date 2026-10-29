/**
 * Campanhas — telas `/campanhas` e `/campanhas/[id]`.
 * Backend: `{IMOBLY_API_URL}/campaigns` via BFF `/api/campaigns`.
 */
import { bffRequest, jsonInit } from "@/lib/api/bff-request";
import { NEXT_PROXY } from "@/lib/api/saas-endpoints";
import type {
  CampaignAction,
  CampaignDetail,
  CampaignListItem,
  ConfirmCampaignResult,
  EligibleContactsPage,
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

export function getEligibleContacts(id: string, page = 1, q = ""): Promise<EligibleContactsPage> {
  const qs = new URLSearchParams({ page: String(page) });
  if (q.trim()) qs.set("q", q.trim());
  return bffRequest<EligibleContactsPage>(`${campaignUrl(id)}/eligible-contacts?${qs.toString()}`);
}

/** Lista vazia limpa a seleção: a campanha volta ao público automático do imóvel. */
export function updateCampaignContacts(id: string, contactIds: string[]): Promise<CampaignDetail> {
  return bffRequest<CampaignDetail>(campaignUrl(id), jsonInit("PATCH", { contactIds }));
}
