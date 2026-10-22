/** Aceita array direto ou envelopes `{ data: T[] }` / `{ items: T[] }` (listas paginadas da API). */
export function parseListResponse<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (!data || typeof data !== "object") return [];
  const envelope = data as { data?: unknown; items?: unknown };
  if (Array.isArray(envelope.data)) return envelope.data as T[];
  if (Array.isArray(envelope.items)) return envelope.items as T[];
  return [];
}
