import type { PrismaClient } from "@prisma/client";
import { DomainError, NotFoundError } from "../domain/errors.js";
import { audit, type Actor, type Tx } from "./deps.js";

export const CONSENT_CHANNEL = "whatsapp";
export const CONSENT_PURPOSE = "marketing_imoveis";

/** Filtro Prisma: contato elegível para receber campanhas promocionais. */
export function eligibleContactWhere(tenantId: string) {
  return {
    tenantId,
    status: "active" as const,
    consents: { some: { channel: CONSENT_CHANNEL, purpose: CONSENT_PURPOSE, revokedAt: null } },
  };
}

export async function isSuppressed(db: PrismaClient | Tx, tenantId: string, phoneE164: string): Promise<boolean> {
  return (await db.suppressionEntry.count({ where: { tenantId, phoneE164 } })) > 0;
}

/** Revalidação no momento do envio (o consentimento pode ter sido revogado durante a campanha). */
export async function canReceiveMarketing(db: PrismaClient | Tx, tenantId: string, contactId: string): Promise<boolean> {
  const c = await db.contact.findFirst({ where: { id: contactId, ...eligibleContactWhere(tenantId) }, select: { phoneE164: true } });
  if (!c) return false;
  return !(await isSuppressed(db, tenantId, c.phoneE164));
}

export interface GrantConsentInput {
  source: string;
  evidenceReference: string;
  scope?: string | null;
  grantedAt?: Date;
  /** Reativar um número da lista de supressão exige ação explícita + evidência nova. */
  overrideSuppression?: boolean;
}

export async function grantConsent(
  db: PrismaClient,
  tenantId: string,
  contactId: string,
  input: GrantConsentInput,
  actor: Actor,
  now = new Date(),
) {
  if (!input.evidenceReference?.trim()) {
    throw new DomainError("consent_evidence_required", "Consentimento exige referência de evidência verificável");
  }
  return db.$transaction(async (tx) => {
    const contact = await tx.contact.findFirst({ where: { id: contactId, tenantId } });
    if (!contact) throw new NotFoundError("Contato");
    if (contact.status === "blocked") throw new DomainError("contact_blocked", "Contato bloqueado");
    const suppressed = await isSuppressed(tx, tenantId, contact.phoneE164);
    if (suppressed && !input.overrideSuppression) {
      throw new DomainError(
        "contact_suppressed",
        "Contato está na lista de supressão (descadastrou). Reativação exige confirmação explícita e nova evidência.",
        409,
      );
    }
    if (suppressed) {
      await tx.suppressionEntry.delete({ where: { tenantId_phoneE164: { tenantId, phoneE164: contact.phoneE164 } } });
    }
    const consent = await tx.contactConsent.create({
      data: {
        tenantId,
        contactId,
        channel: CONSENT_CHANNEL,
        purpose: CONSENT_PURPOSE,
        scope: input.scope ?? null,
        source: input.source,
        evidenceReference: input.evidenceReference,
        grantedAt: input.grantedAt ?? now,
      },
    });
    await tx.contact.update({ where: { id: contactId }, data: { status: "active", optedOutAt: null } });
    await audit(tx, tenantId, actor, suppressed ? "consent.reactivated" : "consent.granted", "contact", contactId, {
      consentId: consent.id,
      source: input.source,
      evidenceReference: input.evidenceReference,
    });
    return consent;
  });
}

export interface OptOutInput {
  source: string;
  reason?: string;
  campaignId?: string | null;
}

/**
 * Descadastro: revoga consentimentos, coloca o telefone na supressão e cancela envios ainda na fila.
 * Idempotente — repetir não gera efeitos extras.
 */
export async function optOutByPhone(
  db: PrismaClient,
  tenantId: string,
  phoneE164: string,
  input: OptOutInput,
  actor: Actor,
  now = new Date(),
): Promise<{ contactId: string | null; alreadySuppressed: boolean; cancelledRecipients: number }> {
  return db.$transaction(async (tx) => {
    const contact = await tx.contact.findUnique({ where: { tenantId_phoneE164: { tenantId, phoneE164 } } });
    const already = await isSuppressed(tx, tenantId, phoneE164);

    let campaignId = input.campaignId ?? null;
    if (contact && !campaignId) {
      // Atribui o descadastro à campanha mais recente recebida nos últimos 7 dias (métrica por campanha).
      const recent = await tx.campaignRecipient.findFirst({
        where: { tenantId, contactId: contact.id, queuedAt: { gte: new Date(now.getTime() - 7 * 86400_000) } },
        orderBy: { queuedAt: "desc" },
      });
      campaignId = recent?.campaignId ?? null;
    }

    if (!already) {
      await tx.suppressionEntry.create({
        data: { tenantId, phoneE164, reason: input.reason ?? "opt_out", source: input.source, campaignId },
      });
    }
    let cancelled = 0;
    if (contact) {
      await tx.contactConsent.updateMany({
        where: { tenantId, contactId: contact.id, revokedAt: null },
        data: { revokedAt: now, revokedSource: input.source },
      });
      if (contact.status !== "opted_out") {
        await tx.contact.update({ where: { id: contact.id }, data: { status: "opted_out", optedOutAt: now } });
      }
      const r = await tx.campaignRecipient.updateMany({
        where: { tenantId, contactId: contact.id, status: "queued" },
        data: { status: "cancelled", errorCode: "consent_revoked" },
      });
      cancelled = r.count;
    }
    if (!already) {
      await audit(tx, tenantId, actor, "consent.revoked", "contact", contact?.id ?? null, {
        phoneE164,
        source: input.source,
        campaignId,
      });
    }
    return { contactId: contact?.id ?? null, alreadySuppressed: already, cancelledRecipients: cancelled };
  });
}
