/**
 * Extração determinística (sem IA) dos dados do imóvel a partir do texto do corretor.
 * Regra: campo não encontrado fica null — nada é inferido além do que está escrito.
 * Uma implementação com IA pode substituir esta via a interface PropertyExtractor,
 * mas o resultado sempre passa pela revisão/confirmação do corretor.
 */
export interface ExtractedProperty {
  title: string | null;
  description: string | null;
  propertyType: string | null;
  transaction: "venda" | "aluguel" | null;
  price: number | null;
  city: string | null;
  neighborhood: string | null;
  bedrooms: number | null;
  suites: number | null;
  bathrooms: number | null;
  parkingSpaces: number | null;
  areaM2: number | null;
  audienceHint: string | null;
  /** Plantas quando o anúncio lista mais de uma (vazio quando há uma só). */
  units: PropertyUnit[];
}

export interface PropertyUnit {
  bedrooms: number | null;
  suites: number | null;
  areaM2: number | null;
  price: number | null;
}

export interface PropertyExtractor {
  extract(text: string): Promise<ExtractedProperty>;
}

const TYPES: [RegExp, string][] = [
  [/\bcobertura\b/i, "cobertura"],
  [/\b(apartamento|apto|ap\.)\b/i, "apartamento"],
  [/\b(studio|st[uú]dio|kitnet|kitinete)\b/i, "studio"],
  [/\bsobrado\b/i, "casa"],
  [/\bcasa\b/i, "casa"],
  [/\b(terreno|lote)\b/i, "terreno"],
  [/\b(sala comercial|conjunto comercial)\b/i, "sala_comercial"],
  [/\b(galp[aã]o)\b/i, "galpao"],
  [/\b(ch[aá]cara|s[ií]tio|fazenda)\b/i, "rural"],
];

function parseBRNumber(raw: string): number | null {
  // "450.000", "450.000,00", "1,2 milhão", "450 mil"
  const s = raw.trim().toLowerCase();
  const mult = /milh(ão|ao|ões|oes)/.test(s) ? 1_000_000 : /\bmil\b/.test(s) ? 1_000 : 1;
  const num = s.match(/\d[\d.]*(?:,\d+)?/)?.[0];
  if (!num) return null;
  const value = Number(num.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) ? Math.round(value * mult * 100) / 100 : null;
}

function intBefore(text: string, words: string): number | null {
  const m = text.match(new RegExp(`(\\d{1,2})\\s*(?:${words})\\b`, "i"));
  return m ? Number(m[1]) : null;
}

function labeled(text: string, label: string): string | null {
  const m = text.match(new RegExp(`^\\s*${label}\\s*[:\\-]\\s*(.+)$`, "im"));
  return m ? m[1]!.trim().replace(/[.;]$/, "") : null;
}

export function extractProperty(text: string): ExtractedProperty {
  const clean = text.replace(/\r/g, "").trim();
  const lines = clean.split("\n").map((l) => l.trim()).filter(Boolean);
  const title = lines[0]?.replace(/[*_~]/g, "").slice(0, 160) ?? null;

  // Lançamentos costumam listar várias plantas ("1 dorm ... R$ 370 mil / 2 dorm ... R$ 385 mil").
  const units = extractUnits(clean);
  const labeledPrice = labeled(clean, "(?:valor|pre[cç]o)");
  const prices = allPrices(clean);
  const price =
    labeledPrice && /\d/.test(labeledPrice) && !/R\$/i.test(labeledPrice)
      ? parseBRNumber(labeledPrice)
      : prices.length
        ? Math.min(...prices)
        : null;

  const propertyType = TYPES.find(([re]) => re.test(clean))?.[1] ?? null;
  const transaction = /\b(aluguel|alugar|loca[cç][aã]o)\b/i.test(clean)
    ? "aluguel"
    : /\b(venda|vende-se|vendo|à venda|a venda)\b/i.test(clean)
      ? "venda"
      : null;

  const areas = allAreas(clean);
  const areaM2 = areas.length ? Math.min(...areas) : null;

  // Localização: campos rotulados, "Localização no <Bairro>" ou "<tipo> ... no/na <Bairro>" na primeira linha.
  let neighborhood = labeled(clean, "bairro") ?? locationLine(clean);
  if (!neighborhood && title) {
    const m = title.match(/\b(?:no|na|em)\s+([A-ZÀ-Ú][\p{L}]+(?:\s+(?:de|do|da|dos|das)?\s*[A-ZÀ-Ú][\p{L}]+)*)\s*$/u);
    neighborhood = m?.[1]?.trim() ?? null;
  }
  const city = labeled(clean, "cidade");

  return {
    title,
    description: clean || null,
    propertyType,
    transaction,
    price,
    city,
    neighborhood,
    // Com várias plantas, guardamos o MAIOR número de quartos/suítes: o público usa "no mínimo N quartos",
    // então quem procura 2 quartos não pode ser excluído por existir também uma planta de 1.
    bedrooms: maxOrNull(allIntsBefore(clean, BEDROOM_WORDS)),
    suites: maxOrNull(allIntsBefore(clean, SUITE_WORDS)),
    bathrooms: intBefore(clean, "banheiros?|wcs?"),
    parkingSpaces: intBefore(clean, "vagas?"),
    areaM2: areaM2 && Number.isFinite(areaM2) ? areaM2 : null,
    audienceHint: labeled(clean, "p[uú]blico"),
    units: units.length > 1 ? units : [],
  };
}

const BEDROOM_WORDS = "quartos?|dormit[óo]rios?|dorms?";
const SUITE_WORDS = "su[ií]tes?";
const PRICE_RE = /R\$\s*\d[\d.,]*(?:\s*(?:milh[õo]es|milh[ãa]o|mil)\b)?/gi;
// "55 m²", "55m2", "55 mts", "55 metros"
const AREA_RE = /(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:m(?:²|2)|mts?\.?|metros(?:\s+quadrados)?)(?![\p{L}\d])/giu;

function allPrices(text: string): number[] {
  return [...text.matchAll(PRICE_RE)]
    .map((m) => parseBRNumber(m[0].replace(/R\$/i, "")))
    .filter((n): n is number => n !== null && n > 0);
}

function allAreas(text: string): number[] {
  return [...text.matchAll(AREA_RE)].map((m) => Number(m[1]!.replace(",", "."))).filter((n) => Number.isFinite(n) && n > 0);
}

function allIntsBefore(text: string, words: string): number[] {
  return [...text.matchAll(new RegExp(`(\\d{1,2})\\s*(?:${words})\\b`, "gi"))].map((m) => Number(m[1]));
}

function maxOrNull(values: number[]): number | null {
  return values.length ? Math.max(...values) : null;
}

function locationLine(text: string): string | null {
  const m = text.match(/^\s*localiza[çc][ãa]o\s*:?\s*(?:no|na|em)?\s+([A-ZÀ-Ú][\p{L}]+(?:\s+(?:de|do|da|dos|das)?\s*[A-ZÀ-Ú][\p{L}]+)*)/imu);
  return m?.[1]?.trim() ?? null;
}

/** Plantas descritas em blocos separados por linha em branco: cada bloco com quartos/área/preço vira uma unidade. */
function extractUnits(text: string): PropertyUnit[] {
  const units: PropertyUnit[] = [];
  for (const block of text.split(/\n\s*\n/)) {
    const bedrooms = allIntsBefore(block, BEDROOM_WORDS)[0] ?? null;
    const areaM2 = allAreas(block)[0] ?? null;
    const price = allPrices(block)[0] ?? null;
    if ([bedrooms, areaM2, price].filter((v) => v !== null).length < 2) continue;
    units.push({ bedrooms, suites: allIntsBefore(block, SUITE_WORDS)[0] ?? null, areaM2, price });
  }
  return units;
}

export class RegexPropertyExtractor implements PropertyExtractor {
  async extract(text: string): Promise<ExtractedProperty> {
    return extractProperty(text);
  }
}

/** Heurística: o texto descreve um imóvel (e não é só conversa)? */
export function looksLikeProperty(e: ExtractedProperty): boolean {
  const signals = [e.price, e.propertyType, e.bedrooms, e.areaM2, e.parkingSpaces].filter((v) => v != null).length;
  return signals >= 2;
}
