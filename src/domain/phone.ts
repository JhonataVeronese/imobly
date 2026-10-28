/**
 * Normaliza telefones para E.164. Números sem DDI são tratados como brasileiros (+55).
 * Retorna null quando o número não é plausível — nunca "adivinha" dígitos.
 */
export function normalizePhoneE164(raw: string, defaultCountry = "55"): string | null {
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (trimmed.startsWith("+")) {
    // já tem DDI
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.length === 10 || digits.length === 11) {
    digits = defaultCountry + digits;
  } else if (digits.length === 12 && digits.startsWith("0")) {
    digits = defaultCountry + digits.slice(1);
  }
  if (digits.length < 10 || digits.length > 15) return null;
  if (digits.startsWith("55") && !(digits.length === 12 || digits.length === 13)) return null;
  return `+${digits}`;
}

/** Formato esperado pela Z-API: só dígitos com DDI ("5511999999999"). */
export function toProviderPhone(e164: string): string {
  return e164.replace(/^\+/, "");
}

/**
 * Chave de comparação para celulares BR: o WhatsApp às vezes reporta números
 * sem o 9º dígito. Usada apenas para casar remetentes, nunca para persistir.
 */
export function phoneMatchKey(e164OrDigits: string): string {
  const d = e164OrDigits.replace(/\D/g, "");
  if (d.startsWith("55") && d.length === 13 && d[4] === "9") return d.slice(0, 4) + d.slice(5);
  return d;
}

/** Variações de um número BR com/sem o 9º dígito, para casar remetentes. */
export function phoneVariants(digits: string): string[] {
  const d = digits.replace(/\D/g, "");
  const out = new Set([`+${d}`]);
  if (d.startsWith("55") && d.length === 13 && d[4] === "9") out.add(`+${d.slice(0, 4)}${d.slice(5)}`);
  if (d.startsWith("55") && d.length === 12 && /[6-9]/.test(d[4]!)) out.add(`+${d.slice(0, 4)}9${d.slice(4)}`);
  return [...out];
}
