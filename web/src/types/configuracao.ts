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

/** Corretor da imobiliária (o administrador da plataforma não pertence a um cliente). */
export type UserListItem = {
  id: string;
  name: string;
  email: string;
  role: "agent";
  phoneE164: string | null;
  status: "active" | "disabled" | string;
  createdAt: string;
};

export type UserCreatePayload = {
  name: string;
  email: string;
  password: string;
  phone?: string;
};

export type UserUpdatePayload = {
  name?: string;
  phone?: string | null;
  status?: "active" | "disabled";
  password?: string;
};

export type TenantStatus = "active" | "suspended";

/** Cliente (imobiliária) visto pelo administrador da plataforma. */
export type AdminTenant = {
  id: string;
  name: string;
  tradeName: string | null;
  contactPhone: string | null;
  status: TenantStatus;
  monthlyMessageLimit: number;
  createdAt: string;
  _count: { users: number; providerAccounts: number; campaigns: number; contacts: number };
};

export type TenantCreatePayload = {
  name: string;
  tradeName?: string | null;
  contactPhone?: string | null;
  monthlyMessageLimit?: number;
  user: UserCreatePayload;
};

export type TenantUpdatePayload = {
  name?: string;
  tradeName?: string | null;
  contactPhone?: string | null;
  monthlyMessageLimit?: number;
  status?: TenantStatus;
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
