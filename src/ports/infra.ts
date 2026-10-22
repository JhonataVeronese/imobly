import type { PacerState } from "../domain/send-pacing.js";

export interface StoragePort {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  /** URL temporária (expira) para entregar o arquivo ao provedor ou ao painel. */
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}

/** Cofre de segredos (credenciais dos provedores). Nunca persistir tokens em texto puro. */
export interface SecretsPort {
  put(tenantId: string, value: Record<string, string>): Promise<string>;
  get(tenantId: string, ref: string): Promise<Record<string, string>>;
}

export interface SendJob {
  tenantId: string;
  recipientId: string;
  /** Número (conta do provedor) que envia — cada um tem fila e ritmo próprios. */
  providerAccountId: string;
}

/** Uma mensagem da conversa do simulador do painel. `chat` = telefone (só dígitos) do outro lado. */
export interface SimulatorEntry {
  seq: number;
  at: string;
  /** in = chegou ao imobly (corretor ou cliente escreveu); out = o imobly enviou. */
  direction: "in" | "out";
  chat: string;
  kind: "text" | "image" | "document";
  text: string | null;
  fileName: string | null;
  /** data: URL ou URL da mídia, para a prévia na tela. */
  media: string | null;
  providerMessageId: string | null;
  /** Falha simulada do provedor (ex.: número sem WhatsApp). */
  error: string | null;
}
export type SimulatorEntryInput = Omit<SimulatorEntry, "seq" | "at">;

export interface SimulatorLogPort {
  push(tenantId: string, entry: SimulatorEntryInput): Promise<void>;
  list(tenantId: string, afterSeq?: number): Promise<SimulatorEntry[]>;
  clear(tenantId: string): Promise<void>;
}

/** Reserva atômica de vagas de envio por número (estado compartilhado entre processos). */
export interface SendPacerPort {
  /** Executa `decide` sobre o estado atual e grava o novo estado sem corrida (compare-and-set). */
  reserve<T>(accountId: string, decide: (state: PacerState | null) => { result: T; next: PacerState | null }): Promise<T>;
}

export interface DraftSummaryJob {
  tenantId: string;
  propertyId: string;
  providerAccountId: string;
  chatId: string;
}

export interface QueuePort {
  /** Agenda (ou adia, se já agendado) o resumo do rascunho — debounce por imóvel. */
  scheduleDraftSummary(job: DraftSummaryJob, delayMs: number): Promise<void>;
  /** jobId = recipientId → enfileirar o mesmo destinatário duas vezes não cria tarefa duplicada. */
  enqueueSends(jobs: SendJob[]): Promise<void>;
  /** jobId = webhookEventId */
  enqueueInbound(webhookEventId: string, delayMs?: number): Promise<void>;
}

export interface Logger {
  info(obj: object | string, msg?: string): void;
  warn(obj: object | string, msg?: string): void;
  error(obj: object | string, msg?: string): void;
  debug(obj: object | string, msg?: string): void;
}
