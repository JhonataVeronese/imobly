/**
 * Porta de saída: qualquer provedor de WhatsApp (Z-API, Meta Cloud API, fake) implementa esta interface.
 * As regras de campanha nunca conhecem detalhes do provedor.
 */
export interface MediaRef {
  mimeType: string;
  /** URL acessível pelo provedor (ex.: URL assinada com expiração) */
  url?: string;
  /** Conteúdo em base64 (sem prefixo data:) */
  base64?: string;
}

export type OutboundContent =
  | { kind: "text"; text: string }
  | { kind: "image"; media: MediaRef; caption?: string }
  | { kind: "document"; media: MediaRef; fileName: string; extension: string; caption?: string };

export interface SendResult {
  providerMessageId: string;
}

/**
 * Classificação de erro que dirige a política de retry:
 * - transient: o provedor garantidamente NÃO processou (ex.: conexão recusada, 503) → retry seguro.
 * - rate_limited: limite de requisições atingido → retry com backoff.
 * - timeout: resultado desconhecido (pode ter sido aceito) → NÃO reenviar automaticamente.
 * - permanent: destinatário/conteúdo inválido → falha definitiva do destinatário.
 * - account_restricted: conta desconectada, credencial inválida ou restrição → pausar a campanha.
 */
export type ProviderErrorKind = "transient" | "rate_limited" | "timeout" | "permanent" | "account_restricted";

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    readonly code: string,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface OutboundMessagingAdapter {
  readonly provider: string;
  /**
   * Como o provedor quer receber mídia. Ausente = segue ASSET_DELIVERY da configuração.
   * `url`: precisa de link público assinado, válido por `ttlSeconds` (ex.: Omni Z-API).
   */
  readonly mediaDelivery?: { mode: "url"; ttlSeconds: number };
  /** `to`: telefone E.164 ou identificador de chat do provedor (ex.: grupo). */
  send(to: string, content: OutboundContent): Promise<SendResult>;
}
