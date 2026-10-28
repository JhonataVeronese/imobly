export type InboundMode = "group" | "direct";

export type ProviderAccount = {
  id: string;
  provider: "zapi" | "omni" | "fake" | "simulator";
  accountReference: string;
  status: string;
  inboundMode: InboundMode;
  inboundChatId: string | null;
  createdAt: string;
};

export type ZapiAccountPayload = {
  provider: "zapi";
  instanceId: string;
  instanceToken: string;
  clientToken?: string;
  inboundMode: InboundMode;
  inboundChatId?: string;
};

export type OmniAccountPayload = {
  provider: "omni";
  channelId: string;
  secretKey: string;
  inboundMode: InboundMode;
  inboundChatId?: string;
};

/** A URL do webhook (com token secreto) só aparece na criação/rotação. */
export type ProviderAccountCreated = ProviderAccount & { webhookUrl: string; note: string };

export type WebhookEvent = {
  id: string;
  eventType: string;
  processingStatus: "pending" | "processed" | "ignored" | "failed";
  processingNote: string | null;
  receivedAt: string;
  payload: unknown;
};

export type ApiUserRole = "owner" | "admin" | "agent";

export type UserListItem = {
  id: string;
  name: string;
  email: string;
  role: ApiUserRole;
  phoneE164: string | null;
  status: string;
};

export type UserCreatePayload = {
  name: string;
  email: string;
  password: string;
  role: "admin" | "agent";
  phone?: string;
};

export const ROLE_LABEL: Record<ApiUserRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  agent: "Corretor",
};

export type AuditLogItem = {
  id: string;
  actorType: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  data: Record<string, unknown>;
  createdAt: string;
};
