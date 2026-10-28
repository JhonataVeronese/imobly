import { toProviderPhone } from "../../domain/phone.js";
import {
  ProviderError,
  type MediaRef,
  type OutboundContent,
  type OutboundMessagingAdapter,
  type SendResult,
} from "../../ports/outbound.js";
import type { OmniClient } from "./omni-client.js";

/** Validade do link do PDF enviado como texto: o cliente pode abrir dias depois. */
const DOCUMENT_LINK_TTL_SECONDS = 30 * 24 * 3600;

/**
 * Envio pela API nativa da Omni Z-API.
 *  - Texto:  content { type: "TEXT", body: { message } }
 *  - Imagem: content { type: "IMAGE", attachments: [{ url, caption }] } — só URL pública.
 *  - PDF:    o envio de DOCUMENT ainda está "em desenvolvimento" na Omni; até lá vai como texto
 *            com o link do arquivo. Trocar aqui quando o endpoint estiver disponível.
 * Sem chave de idempotência no envio: timeout ⇒ status `unknown`, sem reenvio automático.
 */
export class OmniOutboundAdapter implements OutboundMessagingAdapter {
  readonly provider = "omni";
  /** A Omni baixa a mídia por URL: o envio precisa de link assinado, não do arquivo embutido. */
  readonly mediaDelivery = { mode: "url" as const, ttlSeconds: DOCUMENT_LINK_TTL_SECONDS };

  constructor(private readonly client: OmniClient) {}

  async send(to: string, content: OutboundContent): Promise<SendResult> {
    const recipient = { identifier: to.startsWith("+") ? toProviderPhone(to) : to };
    switch (content.kind) {
      case "text":
        return this.post({ recipient, content: { type: "TEXT", body: { message: content.text } } });
      case "image":
        return this.post({
          recipient,
          content: { type: "IMAGE", attachments: [{ url: mediaUrl(content.media), ...(content.caption ? { caption: content.caption } : {}) }] },
        });
      case "document": {
        const text = [content.caption, `📄 ${content.fileName}.${content.extension}`, mediaUrl(content.media)].filter(Boolean).join("\n");
        return this.post({ recipient, content: { type: "TEXT", body: { message: text } } });
      }
    }
  }

  private async post(body: Record<string, unknown>): Promise<SendResult> {
    return { providerMessageId: await this.client.sendMessage(body) };
  }
}

function mediaUrl(m: MediaRef): string {
  if (m.url) return m.url;
  throw new ProviderError("permanent", "media_url_required", "A Omni só aceita mídia por URL pública");
}
