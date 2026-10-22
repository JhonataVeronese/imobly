export interface TemplateVars {
  nome?: string | null;
  primeiro_nome?: string | null;
  titulo?: string | null;
  preco?: string | null;
  descricao?: string | null;
  bairro?: string | null;
  cidade?: string | null;
}

export const DEFAULT_TEMPLATE =
  "Olá, {{primeiro_nome}}! 🏠\n\n{{descricao}}\n\n_Para não receber mais ofertas, responda SAIR._";

const VAR_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;
const KNOWN = new Set(["nome", "primeiro_nome", "titulo", "preco", "descricao", "bairro", "cidade"]);

export function templateVariables(template: string): string[] {
  return [...template.matchAll(VAR_RE)].map((m) => m[1]!);
}

export function validateTemplate(template: string): string[] {
  const errors: string[] = [];
  if (!template.trim()) errors.push("Mensagem vazia");
  if (template.length > 4000) errors.push("Mensagem acima de 4000 caracteres");
  for (const v of templateVariables(template)) {
    if (!KNOWN.has(v)) errors.push(`Variável desconhecida: {{${v}}}`);
  }
  return errors;
}

/** Variáveis ausentes viram string vazia (nunca inventamos dados). */
export function renderTemplate(template: string, vars: TemplateVars): string {
  const values = vars as Record<string, string | null | undefined>;
  return template
    .replace(VAR_RE, (_, name: string) => values[name] ?? "")
    .replace(/Olá, !/g, "Olá!")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatBRL(value: number): string {
  // toLocaleString usa espaço não separável (U+00A0); no WhatsApp preferimos espaço comum.
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).replace(/ /g, " ");
}
