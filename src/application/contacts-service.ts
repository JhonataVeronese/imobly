import type { PrismaClient } from "@prisma/client";
import type { ContactPreferences } from "../domain/audience.js";
import { normalizePhoneE164 } from "../domain/phone.js";
import { CONSENT_CHANNEL, CONSENT_PURPOSE } from "./consent-service.js";
import { audit, type Actor } from "./deps.js";

/** Parser CSV mínimo: aspas, vírgula ou ponto-e-vírgula (Excel pt-BR). */
export function parseCsv(input: string): Record<string, string>[] {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...data] = rows.filter((r) => r.some((c) => c.trim()));
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return data.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

const list = (v?: string) =>
  v
    ? v
        .split(/[|,]/)
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;
const num = (v?: string) => {
  if (!v) return undefined;
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};
const yes = (v?: string) => !!v && /^(s|sim|y|yes|true|1)$/i.test(v);

export interface ImportReport {
  total: number;
  created: number;
  updated: number;
  consentsRecorded: number;
  skippedSuppressedConsent: number;
  invalid: { line: number; reason: string }[];
}

/**
 * Importação de contatos. Colunas: name, phone, tags, property_types, cities, neighborhoods,
 * price_min, price_max, bedrooms_min, investor, consent, consent_source, consent_date, consent_evidence.
 *
 * Importar NÃO autoriza envios: consentimento só é registrado quando a linha traz consent=sim
 * COM origem e evidência verificável. Telefones na lista de supressão nunca são reativados aqui.
 */
export async function importContactsCsv(
  db: PrismaClient,
  tenantId: string,
  csv: string,
  fileName: string,
  actor: Actor,
): Promise<ImportReport> {
  const rows = parseCsv(csv);
  const report: ImportReport = { total: rows.length, created: 0, updated: 0, consentsRecorded: 0, skippedSuppressedConsent: 0, invalid: [] };
  const suppressed = new Set(
    (await db.suppressionEntry.findMany({ where: { tenantId }, select: { phoneE164: true } })).map((s) => s.phoneE164),
  );

  for (const [idx, r] of rows.entries()) {
    const line = idx + 2;
    const phone = normalizePhoneE164(r.phone ?? r.telefone ?? r.whatsapp ?? "");
    if (!phone) {
      report.invalid.push({ line, reason: "telefone inválido" });
      continue;
    }
    const name = (r.name ?? r.nome ?? "").trim() || "Sem nome";
    const preferences: ContactPreferences = {};
    const pt = list(r.property_types);
    if (pt) preferences.propertyTypes = pt.map((s) => s.toLowerCase());
    const cities = list(r.cities);
    if (cities) preferences.cities = cities;
    const nb = list(r.neighborhoods);
    if (nb) preferences.neighborhoods = nb;
    const pmin = num(r.price_min);
    if (pmin != null) preferences.priceMin = pmin;
    const pmax = num(r.price_max);
    if (pmax != null) preferences.priceMax = pmax;
    const bmin = num(r.bedrooms_min);
    if (bmin != null) preferences.bedroomsMin = Math.trunc(bmin);
    if (r.investor) preferences.investor = yes(r.investor);
    const tags = list(r.tags) ?? [];

    const existing = await db.contact.findUnique({ where: { tenantId_phoneE164: { tenantId, phoneE164: phone } } });
    const contact = existing
      ? await db.contact.update({ where: { id: existing.id }, data: { name, preferences, tags } })
      : await db.contact.create({
          data: {
            tenantId,
            name,
            phoneE164: phone,
            source: `csv:${fileName}`,
            preferences,
            tags,
            // Se o número já descadastrou antes, o contato nasce como opted_out.
            status: suppressed.has(phone) ? "opted_out" : "active",
          },
        });
    existing ? report.updated++ : report.created++;

    if (yes(r.consent)) {
      const evidence = r.consent_evidence?.trim();
      const source = r.consent_source?.trim();
      if (!evidence || !source) {
        report.invalid.push({ line, reason: "consent=sim sem consent_source/consent_evidence — consentimento não registrado" });
      } else if (suppressed.has(phone)) {
        report.skippedSuppressedConsent++;
      } else {
        const grantedAt = r.consent_date ? new Date(r.consent_date) : new Date();
        await db.contactConsent.create({
          data: {
            tenantId,
            contactId: contact.id,
            channel: CONSENT_CHANNEL,
            purpose: CONSENT_PURPOSE,
            source,
            evidenceReference: evidence,
            grantedAt: Number.isNaN(grantedAt.getTime()) ? new Date() : grantedAt,
          },
        });
        report.consentsRecorded++;
      }
    }
  }
  await audit(db, tenantId, actor, "contacts.imported", "contact", null, { fileName, ...report, invalid: report.invalid.length });
  return report;
}
