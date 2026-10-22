import { SAAS } from "@/lib/api/saas-endpoints";
import { fetchSaasList, fetchSaasResource } from "@/lib/server/saas-list";
import type { CampaignListItem } from "@/types/campanha";
import type { ContactsPage, SuppressionEntry } from "@/types/contato";

export type PainelData = {
  status: "ok" | "unconfigured" | "error";
  message?: string;
  activeContacts: number;
  runningCampaigns: number;
  awaitingConfirmation: number;
  delivered: number;
  accepted: number;
  optOuts: number;
  recentCampaigns: CampaignListItem[];
};

/** Agrega os números do painel a partir das listagens da API (volume da POC é pequeno). */
export async function loadPainel(): Promise<PainelData> {
  const [campaigns, contacts, suppression] = await Promise.all([
    fetchSaasList<CampaignListItem>(SAAS.campaigns, { requireTenantId: true }),
    fetchSaasResource<ContactsPage>(`${SAAS.contacts}?status=active&pageSize=1`),
    fetchSaasList<SuppressionEntry>(SAAS.suppressionList, { requireTenantId: true }),
  ]);

  const list = campaigns.data;
  const failed = [campaigns, suppression].find((r) => r.status !== "ok");
  const contactsFailed = contacts.status !== "ok" ? contacts : null;

  return {
    status: failed?.status === "unconfigured" || contactsFailed?.status === "unconfigured" ? "unconfigured" : failed || contactsFailed ? "error" : "ok",
    message: (failed?.status === "error" && failed.message) || (contactsFailed?.status === "error" ? contactsFailed.message : undefined),
    activeContacts: contacts.status === "ok" ? contacts.data.total : 0,
    runningCampaigns: list.filter((c) => c.status === "processing" || c.status === "paused").length,
    awaitingConfirmation: list.filter((c) => c.status === "awaiting_confirmation").length,
    delivered: list.reduce((sum, c) => sum + c.metrics.delivered, 0),
    accepted: list.reduce((sum, c) => sum + c.metrics.accepted, 0),
    optOuts: suppression.data.length,
    recentCampaigns: list.slice(0, 5),
  };
}
