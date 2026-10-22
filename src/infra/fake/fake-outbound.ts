import { randomUUID } from "node:crypto";
import type { MessageStatus } from "../../domain/message-status.js";
import { ZapiInboundAdapter } from "../zapi/zapi-inbound.js";
import { ProviderError, type OutboundContent, type OutboundMessagingAdapter, type SendResult } from "../../ports/outbound.js";

export interface SentRecord {
  to: string;
  content: OutboundContent;
  providerMessageId: string;
}

/**
 * Provedor simulado para desenvolvimento e testes. Comportamento pelos 4 últimos dígitos do destino:
 *   0001 → erro permanente        0002 → timeout (resultado desconhecido)
 *   0003 → erro transitório na 1ª tentativa      0004 → limite de requisições na 1ª tentativa
 *   0005 → conta restrita/desconectada
 */
export class FakeOutboundAdapter implements OutboundMessagingAdapter {
  readonly provider = "fake";
  readonly sent: SentRecord[] = [];
  private readonly attempts = new Map<string, number>();
  /** Chamado após aceitar uma mensagem — usado para simular webhooks de status. */
  onAccepted?: (providerMessageId: string, to: string) => void;
  /** Força o próximo envio a falhar com este erro (testes). */
  nextError: ProviderError | null = null;
  /** Visibilidade em desenvolvimento: o que "teria sido enviado". */
  log?: (to: string, content: OutboundContent) => void;

  async send(to: string, content: OutboundContent): Promise<SendResult> {
    if (this.nextError) {
      const e = this.nextError;
      this.nextError = null;
      throw e;
    }
    const n = (this.attempts.get(to) ?? 0) + 1;
    this.attempts.set(to, n);
    const tail = to.slice(-4);
    if (tail === "0001") throw new ProviderError("permanent", "invalid_number", "Número sem WhatsApp");
    if (tail === "0002") throw new ProviderError("timeout", "timeout", "Timeout simulado");
    if (tail === "0003" && n === 1) throw new ProviderError("transient", "http_503", "Indisponível");
    if (tail === "0004" && n === 1) throw new ProviderError("rate_limited", "http_429", "Rate limit", 1000);
    if (tail === "0005") throw new ProviderError("account_restricted", "instance_disconnected", "Instância desconectada");

    const providerMessageId = `fake-${randomUUID()}`;
    this.sent.push({ to, content, providerMessageId });
    if (this.sent.length > 1000) this.sent.splice(0, this.sent.length - 1000);
    this.log?.(to, content);
    this.onAccepted?.(providerMessageId, to);
    return { providerMessageId };
  }
}

/** O provedor fake recebe webhooks no mesmo formato da Z-API (para simular o fluxo real localmente). */
export class FakeInboundAdapter extends ZapiInboundAdapter {
  override readonly provider: string = "fake";
}

/** Liga o fake a um aplicador de status para simular SENT → DELIVERED → READ. */
export function autoStatus(
  adapter: FakeOutboundAdapter,
  apply: (ids: string[], status: MessageStatus) => Promise<void>,
): void {
  adapter.onAccepted = (id) => {
    const steps: [number, MessageStatus][] = [
      [300, "sent"],
      [1200, "delivered"],
    ];
    if (Math.random() < 0.6) steps.push([3000, "read"]);
    for (const [delay, status] of steps) {
      setTimeout(() => void apply([id], status).catch(() => undefined), delay);
    }
  };
}
