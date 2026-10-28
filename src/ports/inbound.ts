import type { MessageStatus } from "../domain/message-status.js";

/**
 * Porta de entrada: cada provedor traduz seu payload de webhook para eventos normalizados.
 * Trocar o canal de entrada (grupo, mensagem direta, formulário web) não altera o domínio.
 */
export interface InboundMedia {
  kind: "image" | "document";
  url: string;
  mimeType: string | null;
  fileName: string | null;
  caption: string | null;
}

/** Cartão de contato compartilhado na conversa ("Enviar contato" do WhatsApp). */
export interface SharedContact {
  name: string | null;
  /** Só dígitos, como o provedor entrega (normalizar antes de gravar). */
  phone: string;
}

export interface InboundMessageEvent {
  type: "message";
  externalEventId: string;
  accountReference: string | null;
  messageId: string;
  /** Chat de origem (telefone em conversa direta, id do grupo em grupos) */
  chatId: string;
  isGroup: boolean;
  fromMe: boolean;
  /** Quem escreveu (participante, em grupos). Só dígitos com DDI. */
  senderPhone: string | null;
  senderName: string | null;
  text: string | null;
  media: InboundMedia[];
  /** Contatos compartilhados nesta mensagem (vazio na maioria das mensagens). */
  contacts: SharedContact[];
  occurredAt: Date;
}

export interface InboundStatusEvent {
  type: "status";
  externalEventId: string;
  accountReference: string | null;
  providerMessageIds: string[];
  status: MessageStatus;
  isGroup: boolean;
  errorCode: string | null;
  occurredAt: Date;
}

export interface IgnoredEvent {
  type: "ignored";
  externalEventId: string;
  accountReference: string | null;
  reason: string;
}

export type NormalizedInboundEvent = InboundMessageEvent | InboundStatusEvent | IgnoredEvent;

export interface InboundAdapter {
  readonly provider: string;
  /** Lança InvalidWebhookError para payload malformado. */
  parse(payload: unknown): NormalizedInboundEvent;
}

export class InvalidWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWebhookError";
  }
}
