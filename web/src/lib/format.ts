import dayjs from "dayjs";

export function formatBRL(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function formatDateTime(value: string | null | undefined): string {
  return value ? dayjs(value).format("DD/MM/YYYY HH:mm") : "—";
}

export function formatDate(value: string | null | undefined): string {
  return value ? dayjs(value).format("DD/MM/YYYY") : "—";
}

/** +5511988887777 → (11) 98888-7777 */
export function formatPhone(e164: string): string {
  const d = e164.replace(/\D/g, "");
  if (!d.startsWith("55") || (d.length !== 12 && d.length !== 13)) return e164;
  const ddd = d.slice(2, 4);
  const rest = d.slice(4);
  const cut = rest.length === 9 ? 5 : 4;
  return `(${ddd}) ${rest.slice(0, cut)}-${rest.slice(cut)}`;
}

export function formatPercent(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}min ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}min`;
}

/** Converte campo de formulário em número ou null (vazio = não informado). */
export function numberOrNull(raw: string): number | null {
  const v = raw.trim().replace(/\./g, "").replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function textOrNull(raw: string): string | null {
  const v = raw.trim();
  return v ? v : null;
}
