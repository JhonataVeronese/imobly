import type { Campaign, ProviderAccount, User } from "@prisma/client";
import { normalizePhoneE164, phoneVariants } from "../domain/phone.js";
import { isSandboxProvider, SANDBOX_CONTACT_SOURCE } from "../domain/sandbox.js";
import type { SharedContact } from "../ports/inbound.js";
import { parseAudience } from "./campaign-service.js";
import { CONSENT_CHANNEL, CONSENT_PURPOSE, grantConsent, isSuppressed } from "./consent-service.js";
import { audit, type AppDeps } from "./deps.js";

/** Origem gravada no contato e no consentimento quando o corretor compartilha o cartão no WhatsApp. */
export const AGENT_SHARED_SOURCE = "corretor_whatsapp";

export interface SharedContactsResult {
  added: string[];
  /** Pediram para sair (lista de supressão) ou estão bloqueados: nunca entram. */
  suppressed: string[];
  invalid: string[];
}

/** Número BR na forma completa (com o 9º dígito) quando o WhatsApp entrega sem ele. */
function canonicalPhone(digits: string): string | null {
  const longest = phoneVariants(digits).sort((a, b) => b.length - a.length)[0]!;
  return normalizePhoneE164(longest);
}

/**
 * Contatos compartilhados pelo corretor no rascunho viram o público EXPLÍCITO da campanha.
 * Consentimento: o corretor atesta ao compartilhar (como na importação por CSV), com a mensagem
 * como evidência e o corretor como ator na auditoria. Quem está na lista de supressão nunca entra,
 * mesmo compartilhado de novo, e a mensagem da campanha continua com a opção SAIR.
 */
export async function attachSharedContacts(
  deps: AppDeps,
  account: ProviderAccount,
  user: User,
  campaign: Campaign,
  shared: SharedContact[],
  messageId: string,
): Promise<SharedContactsResult> {
  const { db } = deps;
  const tenantId = campaign.tenantId;
  const actor = { type: "user" as const, id: user.id };
  const source = isSandboxProvider(account.provider) ? SANDBOX_CONTACT_SOURCE : AGENT_SHARED_SOURCE;
  const result: SharedContactsResult = { added: [], suppressed: [], invalid: [] };
  const audience = parseAudience(campaign.audience);
  const ids = new Set(audience.contactIds ?? []);

  for (const card of shared) {
    const label = card.name ?? card.phone;
    const phone = canonicalPhone(card.phone);
    if (!phone) {
      result.invalid.push(label);
      continue;
    }
    const variants = phoneVariants(phone.slice(1));
    let contact = await db.contact.findFirst({ where: { tenantId, phoneE164: { in: variants } } });
    const suppressed = (await Promise.all(variants.map((v) => isSuppressed(db, tenantId, v)))).some(Boolean);
    if (suppressed || contact?.status === "opted_out" || contact?.status === "blocked") {
      result.suppressed.push(contact?.name ?? label);
      continue;
    }
    contact ??= await db.contact.create({
      data: { tenantId, name: card.name?.trim() || "Sem nome", phoneE164: phone, source },
    });
    const hasConsent = await db.contactConsent.count({
      where: { tenantId, contactId: contact.id, channel: CONSENT_CHANNEL, purpose: CONSENT_PURPOSE, revokedAt: null },
    });
    if (!hasConsent) {
      await grantConsent(
        db,
        tenantId,
        contact.id,
        { source, evidenceReference: `whatsapp:${messageId}`, scope: `atestado pelo corretor ${user.id}` },
        actor,
      );
    }
    ids.add(contact.id);
    result.added.push(contact.name);
  }

  if (ids.size !== (audience.contactIds?.length ?? 0)) {
    // Com lista explícita, o público é exatamente ela (sem cruzar com o perfil do imóvel).
    await db.campaign.update({
      where: { id: campaign.id },
      data: { audience: { ...audience, matchProperty: false, contactIds: [...ids] } },
    });
  }
  await audit(db, tenantId, actor, "campaign.contacts_shared", "campaign", campaign.id, {
    messageId,
    added: result.added.length,
    suppressed: result.suppressed.length,
    invalid: result.invalid.length,
  });
  return result;
}

/** Nomes do público explícito, na ordem em que o corretor compartilhou, para o resumo do rascunho. */
export async function listedContactNames(deps: AppDeps, tenantId: string, contactIds: string[], limit = 10) {
  const ids = contactIds.slice(0, limit);
  const rows = await deps.db.contact.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true } });
  const byId = new Map(rows.map((r) => [r.id, r.name]));
  return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}
