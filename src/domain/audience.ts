import { z } from "zod";

/** Preferências declaradas pelo contato. Campos ausentes = "sem restrição". */
export const contactPreferencesSchema = z
  .object({
    propertyTypes: z.array(z.string()).optional(),
    cities: z.array(z.string()).optional(),
    neighborhoods: z.array(z.string()).optional(),
    priceMin: z.number().nonnegative().optional(),
    priceMax: z.number().nonnegative().optional(),
    bedroomsMin: z.number().int().nonnegative().optional(),
    investor: z.boolean().optional(),
  })
  .strict();
export type ContactPreferences = z.infer<typeof contactPreferencesSchema>;

/** Características do imóvel relevantes para casar com preferências. */
export interface PropertyProfile {
  propertyType?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  price?: number | null;
  bedrooms?: number | null;
}

/**
 * Público de uma campanha.
 * - matchProperty: contato entra se as preferências dele forem compatíveis com o imóvel.
 * - filtros explícitos: escolhidos pelo corretor no painel (segmentos).
 */
export const audienceSchema = z
  .object({
    matchProperty: z.boolean().default(true),
    tagsAny: z.array(z.string()).optional(),
    propertyTypes: z.array(z.string()).optional(),
    cities: z.array(z.string()).optional(),
    neighborhoods: z.array(z.string()).optional(),
    investorOnly: z.boolean().optional(),
  })
  .strict();
export type Audience = z.infer<typeof audienceSchema>;

export function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

function overlaps(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a?.length || !b?.length) return false;
  const set = new Set(a.map(norm));
  return b.some((x) => set.has(norm(x)));
}

function prefAccepts(pref: string[] | undefined, value: string | null | undefined): boolean {
  if (!pref?.length || !value) return true; // sem preferência ou dado desconhecido não exclui
  return pref.map(norm).includes(norm(value));
}

export function isCompatibleWithProperty(prefs: ContactPreferences, p: PropertyProfile): boolean {
  if (!prefAccepts(prefs.propertyTypes, p.propertyType)) return false;
  if (!prefAccepts(prefs.cities, p.city)) return false;
  if (!prefAccepts(prefs.neighborhoods, p.neighborhood)) return false;
  if (p.price != null) {
    if (prefs.priceMax != null && p.price > prefs.priceMax) return false;
    if (prefs.priceMin != null && p.price < prefs.priceMin) return false;
  }
  if (p.bedrooms != null && prefs.bedroomsMin != null && p.bedrooms < prefs.bedroomsMin) return false;
  return true;
}

export interface AudienceCandidate {
  preferences: ContactPreferences;
  tags: string[];
}

export function matchesAudience(c: AudienceCandidate, audience: Audience, property: PropertyProfile): boolean {
  if (audience.matchProperty && !isCompatibleWithProperty(c.preferences, property)) return false;
  if (audience.tagsAny?.length && !overlaps(audience.tagsAny, c.tags)) return false;
  if (audience.propertyTypes?.length && !overlaps(audience.propertyTypes, c.preferences.propertyTypes)) return false;
  if (audience.cities?.length && !overlaps(audience.cities, c.preferences.cities)) return false;
  if (audience.neighborhoods?.length && !overlaps(audience.neighborhoods, c.preferences.neighborhoods)) return false;
  if (audience.investorOnly && !c.preferences.investor) return false;
  return true;
}

/** Lê preferências salvas (JSON do banco) sem quebrar em dados legados/malformados. */
export function parsePreferences(raw: unknown): ContactPreferences {
  const r = contactPreferencesSchema.safeParse(raw ?? {});
  return r.success ? r.data : {};
}
