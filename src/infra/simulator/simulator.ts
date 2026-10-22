import type { Redis } from "ioredis";
import type { MediaRef, OutboundContent, OutboundMessagingAdapter, SendResult } from "../../ports/outbound.js";
import { ProviderError } from "../../ports/outbound.js";
import type { SimulatorEntry, SimulatorEntryInput, SimulatorLogPort } from "../../ports/infra.js";
import type { FakeOutboundAdapter } from "../fake/fake-outbound.js";
import { ZapiInboundAdapter } from "../zapi/zapi-inbound.js";
import { SIMULATOR_PROVIDER } from "../../domain/sandbox.js";

export { SIMULATOR_PROVIDER };

/** Mídia acima disso aparece na tela só como cartão (sem prévia), para não inchar o Redis. */
const MAX_PREVIEW_BYTES = 1_500_000;
const MAX_ENTRIES = 400;

/** Conversa simulada por tenant, numa lista do Redis — API e worker escrevem nela. */
export class RedisSimulatorLog implements SimulatorLogPort {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = "imobly:sim:",
  ) {}

  async push(tenantId: string, entry: SimulatorEntryInput): Promise<void> {
    const seq = await this.redis.incr(`${this.prefix}${tenantId}:seq`);
    const full: SimulatorEntry = { ...entry, seq, at: new Date().toISOString() };
    const key = `${this.prefix}${tenantId}`;
    await this.redis.multi().rpush(key, JSON.stringify(full)).ltrim(key, -MAX_ENTRIES, -1).expire(key, 7 * 24 * 3600).exec();
  }

  async list(tenantId: string, afterSeq = 0): Promise<SimulatorEntry[]> {
    const raw = await this.redis.lrange(`${this.prefix}${tenantId}`, 0, -1);
    return raw.map((r) => JSON.parse(r) as SimulatorEntry).filter((e) => e.seq > afterSeq);
  }

  async clear(tenantId: string): Promise<void> {
    await this.redis.del(`${this.prefix}${tenantId}`);
  }
}

/** Versão em memória para testes. */
export class MemorySimulatorLog implements SimulatorLogPort {
  readonly entries = new Map<string, SimulatorEntry[]>();
  private seq = 0;
  async push(tenantId: string, entry: SimulatorEntryInput) {
    const list = this.entries.get(tenantId) ?? [];
    list.push({ ...entry, seq: ++this.seq, at: new Date().toISOString() });
    this.entries.set(tenantId, list);
  }
  async list(tenantId: string, afterSeq = 0) {
    return (this.entries.get(tenantId) ?? []).filter((e) => e.seq > afterSeq);
  }
  async clear(tenantId: string) {
    this.entries.delete(tenantId);
  }
}

export function previewOf(media: MediaRef): string | null {
  if (media.base64 && media.base64.length * 0.75 <= MAX_PREVIEW_BYTES) return `data:${media.mimeType};base64,${media.base64}`;
  return media.url ?? null;
}

/**
 * Saída do simulador: reaproveita o provedor fake (mesmos cenários de erro pelos 4 últimos dígitos
 * e status simulados entregue/lida) e registra cada mensagem na conversa da tela.
 */
export class SimulatorOutboundAdapter implements OutboundMessagingAdapter {
  readonly provider = SIMULATOR_PROVIDER;

  constructor(
    private readonly fake: FakeOutboundAdapter,
    private readonly log: SimulatorLogPort,
    private readonly tenantId: string,
  ) {}

  async send(to: string, content: OutboundContent): Promise<SendResult> {
    const base = {
      direction: "out" as const,
      chat: to.replace(/\D/g, ""),
      kind: content.kind,
      text: content.kind === "text" ? content.text : (content.caption ?? null),
      fileName: content.kind === "document" ? `${content.fileName}.${content.extension}` : null,
      media: content.kind === "text" ? null : previewOf(content.media),
    };
    try {
      const r = await this.fake.send(to, content);
      await this.log.push(this.tenantId, { ...base, providerMessageId: r.providerMessageId, error: null });
      return r;
    } catch (err) {
      if (err instanceof ProviderError) {
        await this.log.push(this.tenantId, { ...base, providerMessageId: null, error: err.message });
      }
      throw err;
    }
  }
}

/** Entrada do simulador: mesmo formato de webhook da Z-API. */
export class SimulatorInboundAdapter extends ZapiInboundAdapter {
  override readonly provider: string = SIMULATOR_PROVIDER;
}
