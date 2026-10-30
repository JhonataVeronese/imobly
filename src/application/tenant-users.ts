import { z } from "zod";
import { DomainError, NotFoundError } from "../domain/errors.js";
import { normalizePhoneE164 } from "../domain/phone.js";
import { hashPassword } from "../http/auth.js";
import { audit, isUniqueViolation, type Actor, type AppDeps } from "./deps.js";

export const userCreateBody = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  password: z.string().min(8),
  /** WhatsApp autorizado a enviar imóveis pelo canal de entrada. */
  phone: z.string().optional(),
});

export const userUpdateBody = z.object({
  name: z.string().trim().min(2).optional(),
  /** Vazio ou null remove o WhatsApp: o usuário deixa de ser remetente autorizado. */
  phone: z.string().nullable().optional(),
  status: z.enum(["active", "disabled"]).optional(),
  /** Nova senha definida pelo administrador. */
  password: z.string().min(8).optional(),
});

export const userPublicFields = { id: true, name: true, email: true, role: true, phoneE164: true, status: true, createdAt: true } as const;

export function phoneOrThrow(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  const p = normalizePhoneE164(raw);
  if (!p) throw new DomainError("invalid_phone", "Telefone inválido");
  return p;
}

function conflict(err: unknown): never {
  if (isUniqueViolation(err)) throw new DomainError("conflict", "E-mail ou WhatsApp já cadastrado em outro usuário", 409);
  throw err;
}

/** Corretor da imobiliária (único perfil de tenant). */
export async function createTenantUser(deps: AppDeps, tenantId: string, raw: unknown, actor: Actor) {
  const b = userCreateBody.parse(raw);
  const user = await deps.db.user
    .create({
      data: {
        tenantId,
        name: b.name,
        email: b.email.toLowerCase(),
        passwordHash: await hashPassword(b.password),
        role: "agent",
        phoneE164: phoneOrThrow(b.phone),
      },
      select: userPublicFields,
    })
    .catch(conflict);
  await audit(deps.db, tenantId, actor, "user.created", "user", user.id, {});
  return user;
}

export async function updateTenantUser(deps: AppDeps, tenantId: string, id: string, raw: unknown, actor: Actor) {
  const b = userUpdateBody.parse(raw);
  const current = await deps.db.user.findFirst({ where: { id, tenantId }, select: { id: true, phoneE164: true } });
  if (!current) throw new NotFoundError("Usuário");
  const phone = b.phone === undefined ? undefined : phoneOrThrow(b.phone);
  const user = await deps.db.user
    .update({
      where: { id: current.id },
      data: {
        ...(b.name ? { name: b.name } : {}),
        ...(phone !== undefined ? { phoneE164: phone } : {}),
        ...(b.status ? { status: b.status } : {}),
        ...(b.password ? { passwordHash: await hashPassword(b.password) } : {}),
      },
      select: userPublicFields,
    })
    .catch(conflict);
  await audit(deps.db, tenantId, actor, "user.updated", "user", user.id, {
    phoneChanged: phone !== undefined && phone !== current.phoneE164,
    ...(b.status ? { status: b.status } : {}),
    ...(b.password ? { passwordReset: true } : {}),
  });
  return user;
}
