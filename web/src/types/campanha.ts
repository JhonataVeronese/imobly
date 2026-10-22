export const CAMPAIGN_ACTIONS = ["confirm", "pause", "resume", "cancel"] as const;
export type CampaignAction = (typeof CAMPAIGN_ACTIONS)[number];

export type CampaignStatus =
  | "draft"
  | "awaiting_confirmation"
  | "scheduled"
  | "processing"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed";

export type MessageStatus =
  | "queued"
  | "processing"
  | "accepted"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "cancelled"
  | "unknown";

export const MESSAGE_STATUSES: readonly MessageStatus[] = [
  "queued",
  "processing",
  "accepted",
  "sent",
  "delivered",
  "read",
  "failed",
  "cancelled",
  "unknown",
];

/** Métricas calculadas pela API (`GET /campaigns/:id`). */
export type CampaignMetrics = {
  eligible: number;
  recipients: number;
  queued: number;
  accepted: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  unknown: number;
  cancelled: number;
  optOuts: number;
  durationMs: number | null;
  /** Entregues ÷ aceitas pelo provedor. */
  deliveryRate: number | null;
  /** Lidas ÷ entregues. */
  readRate: number | null;
};

export type CampaignListItem = {
  id: string;
  name: string;
  status: CampaignStatus;
  statusReason: string | null;
  eligibleCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  property: { title: string | null; price: string | null } | null;
  metrics: CampaignMetrics;
};

export type CampaignDetail = CampaignListItem & {
  propertyId: string;
  messageTemplate: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  property: {
    id: string;
    title: string | null;
    price: string | null;
    assets: { id: string; kind: "image" | "document"; originalName: string | null }[];
  } | null;
};

export type RecipientItem = {
  id: string;
  phoneE164: string;
  status: MessageStatus;
  attemptCount: number;
  errorCode: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  contact: { name: string };
  messages: { part: number; kind: string; status: MessageStatus; errorCode: string | null }[];
};

export type RecipientsPage = {
  items: RecipientItem[];
  total: number;
  page: number;
};

export type ConfirmCampaignResult = {
  alreadyConfirmed: boolean;
  recipients: number;
};
