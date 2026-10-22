import type { Redis } from "ioredis";
import type { PacerState } from "../../domain/send-pacing.js";
import type { SendPacerPort } from "../../ports/infra.js";

// Grava ARGV[2] só se o valor atual ainda for ARGV[1] ("" = chave inexistente).
const CAS = `
local cur = redis.call('GET', KEYS[1])
if (cur == false and ARGV[1] == '') or cur == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])
  return 1
end
return 0`;

const STATE_TTL_MS = 3 * 24 * 3600 * 1000;

/** Estado do ritmo de cada número no Redis — vale para vários processos de worker ao mesmo tempo. */
export class RedisSendPacer implements SendPacerPort {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = "imobly:pacer:",
  ) {}

  async reserve<T>(accountId: string, decide: (state: PacerState | null) => { result: T; next: PacerState | null }): Promise<T> {
    const key = this.prefix + accountId;
    for (let i = 0; i < 20; i++) {
      const raw = await this.redis.get(key);
      const { result, next } = decide(raw ? (JSON.parse(raw) as PacerState) : null);
      if (!next) return result;
      const ok = await this.redis.eval(CAS, 1, key, raw ?? "", JSON.stringify(next), String(STATE_TTL_MS));
      if (ok === 1) return result;
    }
    throw new Error(`pacer: disputa excessiva pela vaga do número ${accountId}`);
  }
}

/** Versão em memória para testes. */
export class MemorySendPacer implements SendPacerPort {
  readonly states = new Map<string, PacerState>();
  async reserve<T>(accountId: string, decide: (state: PacerState | null) => { result: T; next: PacerState | null }): Promise<T> {
    const { result, next } = decide(this.states.get(accountId) ?? null);
    if (next) this.states.set(accountId, next);
    return result;
  }
}
