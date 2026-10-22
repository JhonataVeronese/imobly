/**
 * Ritmo de envio por número de WhatsApp (conta do provedor).
 *
 * Disparo em rajada é o principal motivo de restrição de números. A política espaça os envios
 * de cada número com intervalo mínimo + variação, faz uma pausa longa a cada lote, respeita uma
 * janela de horário comercial e um teto diário. Números diferentes andam em paralelo.
 * Funções puras: o estado fica no Redis (infra/queue/redis-pacer.ts) e o relógio vem de fora.
 */
export interface PacingPolicy {
  /** Intervalo mínimo entre dois destinatários do mesmo número. */
  minIntervalMs: number;
  /** Variação aleatória somada ao intervalo (0..jitterMs). */
  jitterMs: number;
  /** A cada `batchSize` destinatários, espera `batchPauseMs` antes do próximo. 0 desliga. */
  batchSize: number;
  batchPauseMs: number;
  /** Teto de destinatários por número por dia (no fuso da janela). */
  dailyCap: number;
  /** Janela de envio [startHour, endHour) no fuso `timeZone`. */
  windowStartHour: number;
  windowEndHour: number;
  timeZone: string;
}

/**
 * Ritmo do número do simulador do painel: mesma mecânica (intervalo, variação, pausa de lote),
 * em escala de segundos para a demonstração caber na tela. Sem janela de horário nem teto real.
 * Nunca vale para números de verdade.
 */
export const SIMULATOR_PACING: PacingPolicy = {
  minIntervalMs: 2_000,
  jitterMs: 2_000,
  batchSize: 3,
  batchPauseMs: 12_000,
  dailyCap: 10_000,
  windowStartHour: 0,
  windowEndHour: 24,
  timeZone: "America/Sao_Paulo",
};

export interface PacerState {
  /** Instante (ms) a partir do qual o próximo envio pode sair. */
  nextAt: number;
  /** Dia local (YYYY-MM-DD) a que `count` se refere. */
  day: string;
  count: number;
}

export type SlotDecision =
  /** Vaga reservada: aguardar `waitMs` (curto) e enviar. `state` deve ser gravado. */
  | { kind: "reserved"; slotAt: number; waitMs: number; state: PacerState }
  /** Próxima vaga está longe (pausa de lote, fora da janela, teto diário): adiar sem reservar. */
  | { kind: "defer"; until: number; reason: "interval" | "batch_pause" | "window" | "daily_cap" };

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();
const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

function localParts(ms: number, timeZone: string): LocalParts {
  let f = partsFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit" });
    partsFormatters.set(timeZone, f);
  }
  const p = Object.fromEntries(f.formatToParts(ms).map((x) => [x.type, x.value]));
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour) };
}

/** Diferença (ms) entre o horário local e UTC no instante `ms`. */
function offsetAt(ms: number, timeZone: string): number {
  let f = offsetFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    offsetFormatters.set(timeZone, f);
  }
  const p = Object.fromEntries(f.formatToParts(ms).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return asUtc - Math.floor(ms / 60_000) * 60_000;
}

/** Instante UTC de `hour`:00 do dia local (year, month, day + addDays). */
function zonedTime(year: number, month: number, day: number, hour: number, timeZone: string, addDays = 0): number {
  const naive = Date.UTC(year, month - 1, day + addDays, hour);
  return naive - offsetAt(naive, timeZone);
}

export function localDay(ms: number, timeZone: string): string {
  const p = localParts(ms, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Primeiro instante >= ms dentro da janela de envio. */
export function intoWindow(ms: number, policy: PacingPolicy): number {
  const p = localParts(ms, policy.timeZone);
  if (p.hour < policy.windowStartHour) return zonedTime(p.year, p.month, p.day, policy.windowStartHour, policy.timeZone);
  if (p.hour >= policy.windowEndHour) return zonedTime(p.year, p.month, p.day, policy.windowStartHour, policy.timeZone, 1);
  return ms;
}

/** Abertura da janela no dia local seguinte ao de `ms`. */
function nextDayWindowStart(ms: number, policy: PacingPolicy): number {
  const p = localParts(ms, policy.timeZone);
  return zonedTime(p.year, p.month, p.day, policy.windowStartHour, policy.timeZone, 1);
}

/**
 * Decide a vaga do próximo destinatário de um número.
 * Só reserva quando a espera cabe em `maxInlineWaitMs` — esperas longas viram "defer", sem
 * consumir vaga (se a campanha for pausada/cancelada no meio, nada fica reservado à toa).
 */
export function decideSlot(
  state: PacerState | null,
  nowMs: number,
  policy: PacingPolicy,
  random: () => number = Math.random,
  maxInlineWaitMs = policy.minIntervalMs + policy.jitterMs,
): SlotDecision {
  const earliest = Math.max(nowMs, state?.nextAt ?? 0);
  let slot = intoWindow(earliest, policy);
  let reason: "interval" | "batch_pause" | "window" | "daily_cap" =
    slot > earliest ? "window" : earliest - nowMs > policy.minIntervalMs + policy.jitterMs ? "batch_pause" : "interval";

  let day = localDay(slot, policy.timeZone);
  let count = state && state.day === day ? state.count : 0;
  if (count >= policy.dailyCap) {
    slot = nextDayWindowStart(slot, policy);
    day = localDay(slot, policy.timeZone);
    count = 0;
    reason = "daily_cap";
  }

  const waitMs = slot - nowMs;
  if (waitMs > maxInlineWaitMs) return { kind: "defer", until: slot, reason };

  const sent = count + 1;
  const gap =
    policy.batchSize > 0 && sent % policy.batchSize === 0
      ? policy.batchPauseMs
      : policy.minIntervalMs + Math.floor(random() * (policy.jitterMs + 1));
  return { kind: "reserved", slotAt: slot, waitMs: Math.max(0, waitMs), state: { nextAt: slot + gap, day, count: sent } };
}

/** Estimativa (ms) para um número enviar `recipients` mensagens a partir de `nowMs`, sem fila prévia. */
export function estimateDurationMs(recipients: number, nowMs: number, policy: PacingPolicy): number {
  let state: PacerState | null = null;
  let last = nowMs;
  for (let i = 0; i < recipients; i++) {
    const d = decideSlot(state, last, policy, () => 0.5, Number.POSITIVE_INFINITY);
    if (d.kind !== "reserved") break; // inalcançável com espera ilimitada
    last = d.slotAt;
    state = d.state;
  }
  return last - nowMs;
}

/** "2h15min", "40min", "menos de 1 min". */
export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 1) return "menos de 1 min";
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  return [d && `${d}d`, h && `${h}h`, m && `${m}min`].filter(Boolean).join("");
}
