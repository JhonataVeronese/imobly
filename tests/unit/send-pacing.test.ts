import { describe, expect, it } from "vitest";
import { decideSlot, estimateDurationMs, formatDuration, intoWindow, type PacerState, type PacingPolicy } from "../../src/domain/send-pacing.js";

const policy: PacingPolicy = {
  minIntervalMs: 20_000,
  jitterMs: 20_000,
  batchSize: 40,
  batchPauseMs: 10 * 60_000,
  dailyCap: 300,
  windowStartHour: 8,
  windowEndHour: 20,
  timeZone: "America/Sao_Paulo",
};

// 2026-10-19 10:00 em São Paulo (UTC-3) = 13:00 UTC
const TEN_AM = Date.UTC(2026, 9, 19, 13, 0);
const half = () => 0.5;

/** Simula N envios seguidos de um número, sempre no instante da vaga. */
function run(n: number, start = TEN_AM, p = policy) {
  let state: PacerState | null = null;
  let t = start;
  const slots: number[] = [];
  for (let i = 0; i < n; i++) {
    const d = decideSlot(state, t, p, half, Number.POSITIVE_INFINITY);
    if (d.kind !== "reserved") throw new Error("esperava vaga");
    slots.push(d.slotAt);
    state = d.state;
    t = d.slotAt;
  }
  return { slots, state: state! };
}

describe("ritmo de envio por número", () => {
  it("primeiro envio sai na hora; o seguinte respeita intervalo + variação", () => {
    const first = decideSlot(null, TEN_AM, policy, half);
    expect(first).toMatchObject({ kind: "reserved", waitMs: 0, slotAt: TEN_AM });
    if (first.kind !== "reserved") return;
    expect(first.state.nextAt).toBe(TEN_AM + 30_000);

    const second = decideSlot(first.state, TEN_AM + 1000, policy, half);
    expect(second).toMatchObject({ kind: "reserved", waitMs: 29_000 });
  });

  it("nunca dois envios do mesmo número com menos que o intervalo mínimo", () => {
    const { slots } = run(39);
    for (let i = 1; i < slots.length; i++) expect(slots[i]! - slots[i - 1]!).toBeGreaterThanOrEqual(policy.minIntervalMs);
  });

  it("faz pausa longa a cada lote, sem reservar a vaga (adiamento)", () => {
    const { state } = run(40);
    const d = decideSlot(state, state.nextAt - policy.batchPauseMs + 1000, policy, half);
    expect(d).toMatchObject({ kind: "defer", reason: "batch_pause" });
  });

  it("fora do horário, adia para a abertura da janela", () => {
    const nineAtNight = Date.UTC(2026, 9, 19, 23 + 0, 30); // 20:30 em SP
    const d = decideSlot(null, nineAtNight, policy, half);
    expect(d).toMatchObject({ kind: "defer", reason: "window", until: Date.UTC(2026, 9, 20, 11, 0) }); // 08:00 SP do dia seguinte
    expect(intoWindow(Date.UTC(2026, 9, 19, 9, 0), policy)).toBe(Date.UTC(2026, 9, 19, 11, 0)); // 06:00 → 08:00
  });

  it("respeita o teto diário e continua no dia seguinte", () => {
    const capped = { ...policy, dailyCap: 3, batchSize: 0 };
    const { state } = run(3, TEN_AM, capped);
    const d = decideSlot(state, state.nextAt, capped, half);
    expect(d).toMatchObject({ kind: "defer", reason: "daily_cap", until: Date.UTC(2026, 9, 20, 11, 0) });
  });

  it("estima a duração considerando pausas, janela e teto", () => {
    expect(estimateDurationMs(1, TEN_AM, policy)).toBe(0);
    const ms = estimateDurationMs(100, TEN_AM, policy);
    // 99 intervalos de ~30 s + 2 pausas de lote (10 min) ≈ 69 min
    expect(Math.round(ms / 60_000)).toBe(Math.round((97 * 30_000 + 2 * 600_000) / 60_000));
    expect(formatDuration(ms)).toMatch(/^1h\d+min$/);
    expect(formatDuration(20_000)).toBe("menos de 1 min");
  });
});
