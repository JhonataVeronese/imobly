import { ProviderError } from "../../ports/outbound.js";
import { classifyNetworkError } from "../zapi/zapi-outbound.js";

export interface OmniCredentials {
  channelId: string;
  /** Secret Key da conta Omni (painel > Segurança): `Authorization: Bearer`. */
  secretKey: string;
}

/** Eventos que o imobly assina: mensagens recebidas e mudanças de status das enviadas. */
export const OMNI_WEBHOOK_EVENTS = ["MESSAGE_RECEIVED", "MESSAGE_STATUS"] as const;

export interface OmniWebhook {
  id: string;
  /** Só vem na criação/atualização com `signing: true`. */
  secret?: string;
}

/**
 * Cliente da API nativa da Omni Z-API (developer.omni.z-api.io), base https://api.omni.z-api.io.
 * Envio:    POST /v1/channels/{channelId}/messages            → { messageId }
 * Webhooks: POST /v1/channels/{channelId}/webhooks            → { id, secret? }
 *           PATCH /v1/channels/{channelId}/webhooks/{id}
 * Webhooks criados com payloadFormat "Z_API": o corpo chega no formato da Z-API clássica,
 * já coberto pelo nosso parser.
 */
export class OmniClient {
  constructor(
    private readonly creds: OmniCredentials,
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private url(path: string) {
    return `${this.baseUrl}/v1/channels/${encodeURIComponent(this.creds.channelId)}${path}`;
  }

  async request<T>(method: string, path: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(this.url(path), {
        method,
        headers: { Authorization: `Bearer ${this.creds.secretKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw classifyNetworkError(err);
    }
    const text = await res.text().catch(() => "");
    if (!res.ok) throw classifyOmniError(res.status, text, res.headers.get("retry-after"));
    try {
      return JSON.parse(text) as T;
    } catch {
      // 2xx sem JSON: não dá para saber se foi aceito.
      throw new ProviderError("timeout", "invalid_response", "Resposta sem JSON válido");
    }
  }

  async sendMessage(body: Record<string, unknown>): Promise<string> {
    const json = await this.request<{ messageId?: string }>("POST", "/messages", body);
    if (!json.messageId) throw new ProviderError("timeout", "missing_message_id", "Resposta sem messageId");
    return json.messageId;
  }

  createWebhook(url: string): Promise<OmniWebhook> {
    return this.request("POST", "/webhooks", {
      url,
      events: OMNI_WEBHOOK_EVENTS,
      signing: true,
      payloadFormat: "Z_API",
      description: "Auren",
    });
  }

  /** Troca a URL (rotação do token) sem mexer no segredo da assinatura. */
  updateWebhookUrl(webhookId: string, url: string): Promise<OmniWebhook> {
    return this.request("PATCH", `/webhooks/${encodeURIComponent(webhookId)}`, { url });
  }
}

/**
 * Erros documentados: 400 "Authorization invalid", 401 token ausente/inválido,
 * 422 BUSINESS_RULE_VIOLATION com subCode CHANNEL_DISCONNECTED (não envia nem enfileira).
 */
export function classifyOmniError(status: number, body: string, retryAfter: string | null): ProviderError {
  const snippet = body.slice(0, 200);
  if (status === 429) {
    const ms = retryAfter ? Number(retryAfter) * 1000 : undefined;
    return new ProviderError("rate_limited", "http_429", "Limite de requisições do provedor", Number.isFinite(ms) ? ms : undefined);
  }
  if (status === 401 || status === 403 || /authorization invalid/i.test(body)) {
    return new ProviderError("account_restricted", `http_${status}`, snippet || "Credencial recusada pela Omni");
  }
  if (/CHANNEL_DISCONNECTED|disconnected|desconectad/i.test(body)) {
    return new ProviderError("account_restricted", "channel_disconnected", snippet);
  }
  if (status === 503) return new ProviderError("transient", "http_503", snippet);
  // 5xx: o provedor pode ter processado — tratado como resultado desconhecido (sem reenvio).
  if (status >= 500) return new ProviderError("timeout", `http_${status}`, snippet);
  return new ProviderError("permanent", `http_${status}`, snippet);
}
