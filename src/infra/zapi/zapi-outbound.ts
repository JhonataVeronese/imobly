import { toProviderPhone } from "../../domain/phone.js";
import {
  ProviderError,
  type MediaRef,
  type OutboundContent,
  type OutboundMessagingAdapter,
  type SendResult,
} from "../../ports/outbound.js";

export interface ZapiCredentials {
  instanceId: string;
  instanceToken: string;
  /** Token de segurança da conta (header Client-Token), quando ativado no painel Z-API */
  clientToken?: string;
}

/**
 * Envio via Z-API. Endpoints conferidos na documentação oficial:
 *   POST {base}/instances/{instanceId}/token/{token}/send-text            { phone, message }
 *   POST {base}/instances/{instanceId}/token/{token}/send-image           { phone, image, caption }
 *   POST {base}/instances/{instanceId}/token/{token}/send-document/{ext}  { phone, document, fileName, caption }
 * Resposta 200: { zaapId, messageId, id }.
 * Não usamos `delayMessage` — atrasos não são mecanismo de controle aqui; a vazão é controlada pela fila.
 * A Z-API não oferece chave de idempotência no envio: por isso timeout ⇒ status `unknown`, sem reenvio automático.
 */
export class ZapiOutboundAdapter implements OutboundMessagingAdapter {
  readonly provider = "zapi";

  constructor(
    private readonly creds: ZapiCredentials,
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(to: string, content: OutboundContent): Promise<SendResult> {
    const phone = to.startsWith("+") ? toProviderPhone(to) : to;
    switch (content.kind) {
      case "text":
        return this.post("send-text", { phone, message: content.text });
      case "image":
        return this.post("send-image", { phone, image: mediaValue(content.media), caption: content.caption });
      case "document":
        return this.post(`send-document/${encodeURIComponent(content.extension)}`, {
          phone,
          document: mediaValue(content.media),
          fileName: content.fileName,
          caption: content.caption,
        });
    }
  }

  private async post(path: string, body: Record<string, unknown>): Promise<SendResult> {
    const url = `${this.baseUrl}/instances/${encodeURIComponent(this.creds.instanceId)}/token/${encodeURIComponent(
      this.creds.instanceToken,
    )}/${path}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.creds.clientToken) headers["Client-Token"] = this.creds.clientToken;

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw classifyNetworkError(err);
    }

    const text = await res.text().catch(() => "");
    if (res.ok) {
      let json: { messageId?: string; zaapId?: string; id?: string } = {};
      try {
        json = JSON.parse(text);
      } catch {
        // 200 sem JSON: não sabemos se foi aceito
        throw new ProviderError("timeout", "invalid_response", "Resposta 200 sem JSON válido");
      }
      const id = json.messageId ?? json.id ?? json.zaapId;
      if (!id) throw new ProviderError("timeout", "missing_message_id", "Resposta sem messageId");
      return { providerMessageId: id };
    }
    throw classifyHttpError(res.status, text, res.headers.get("retry-after"));
  }
}

function mediaValue(m: MediaRef): string {
  if (m.url) return m.url;
  if (m.base64) return `data:${m.mimeType};base64,${m.base64}`;
  throw new ProviderError("permanent", "media_missing", "Mídia sem URL nem conteúdo");
}

export function classifyNetworkError(err: unknown): ProviderError {
  const e = err as { name?: string; cause?: { code?: string }; message?: string };
  if (e.name === "TimeoutError" || e.name === "AbortError") {
    return new ProviderError("timeout", "timeout", "Timeout aguardando resposta do provedor");
  }
  const code = e.cause?.code ?? "network_error";
  // Falhas antes de a requisição sair do cliente: seguro tentar de novo.
  if (["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ECONNRESET_BEFORE_SEND"].includes(code)) {
    return new ProviderError("transient", code, e.message ?? code);
  }
  // ECONNRESET/socket hang up podem ocorrer depois de o provedor receber o pedido.
  return new ProviderError("timeout", code, e.message ?? code);
}

export function classifyHttpError(status: number, body: string, retryAfter: string | null): ProviderError {
  const snippet = body.slice(0, 200);
  if (status === 429) {
    const ms = retryAfter ? Number(retryAfter) * 1000 : undefined;
    return new ProviderError("rate_limited", "http_429", "Limite de requisições do provedor", Number.isFinite(ms) ? ms : undefined);
  }
  if (status === 401 || status === 403) return new ProviderError("account_restricted", `http_${status}`, snippet);
  if (/not connected|disconnected|desconectad|connect your phone/i.test(body)) {
    return new ProviderError("account_restricted", "instance_disconnected", snippet);
  }
  if (status === 503) return new ProviderError("transient", "http_503", snippet);
  if (status >= 500) return new ProviderError("timeout", `http_${status}`, snippet);
  return new ProviderError("permanent", `http_${status}`, snippet);
}
