import { DomainError } from "./errors.js";

export const CAMPAIGN_STATUSES = [
  "draft",
  "awaiting_confirmation",
  "scheduled",
  "processing",
  "paused",
  "completed",
  "cancelled",
  "failed",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

const TRANSITIONS: Record<CampaignStatus, readonly CampaignStatus[]> = {
  draft: ["awaiting_confirmation", "cancelled"],
  awaiting_confirmation: ["draft", "scheduled", "processing", "cancelled"],
  scheduled: ["processing", "paused", "cancelled"],
  processing: ["paused", "completed", "cancelled", "failed"],
  paused: ["processing", "cancelled"],
  completed: [],
  cancelled: [],
  failed: [],
};

/** Rótulos para mensagens ao usuário (adjetivo no feminino: "a campanha está ..."). */
export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "em rascunho",
  awaiting_confirmation: "aguardando confirmação",
  scheduled: "agendada",
  processing: "em processamento",
  paused: "pausada",
  completed: "concluída",
  cancelled: "cancelada",
  failed: "com falha",
};

export function canTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: CampaignStatus, to: CampaignStatus): void {
  if (!canTransition(from, to)) {
    throw new DomainError("invalid_transition", `Campanha ${CAMPAIGN_STATUS_LABEL[from]} não pode ficar ${CAMPAIGN_STATUS_LABEL[to]}`, 409);
  }
}

/** Estados de origem válidos para chegar em `to` — usado em updates condicionais (compare-and-set). */
export function allowedSources(to: CampaignStatus): CampaignStatus[] {
  return CAMPAIGN_STATUSES.filter((from) => TRANSITIONS[from].includes(to));
}

export function isTerminal(status: CampaignStatus): boolean {
  return TRANSITIONS[status].length === 0;
}
