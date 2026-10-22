import type { MessageStatus } from "./campanha";

export interface SimulatorEntry {
  seq: number;
  at: string;
  /** in = chegou ao imobly; out = o imobly enviou. */
  direction: "in" | "out";
  /** Telefone (só dígitos) do outro lado da conversa. */
  chat: string;
  kind: "text" | "image" | "document";
  text: string | null;
  fileName: string | null;
  media: string | null;
  providerMessageId: string | null;
  error: string | null;
}

export interface SimulatorContact {
  id: string;
  name: string;
  phone: string;
  profile: string | null;
  canReceive: boolean;
}

export interface SimulatorQueue {
  id: string;
  name: string;
  status: string;
  statusLabel: string;
  eligible: number;
  queued: number;
  accepted: number;
  delivered: number;
  read: number;
  failed: number;
  optOuts: number;
  eta: string | null;
}

export interface SimulatorState {
  agentPhone: string;
  entries: SimulatorEntry[];
  statuses: Record<string, MessageStatus>;
  contacts: SimulatorContact[];
  campaign: SimulatorQueue | null;
}
