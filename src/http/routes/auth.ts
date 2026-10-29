import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit, isUniqueViolation, type AppDeps } from "../../application/deps.js";
import { DomainError, NotFoundError } from "../../domain/errors.js";
import { normalizePhoneE164 } from "../../domain/phone.js";
import { hashPassword, requireAuth, requireRole, verifyPassword } from "../auth.js";

const registerBody = z.object({
  tenantName: z.string().min(2),
  tradeName: z.string().optional(),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional(),
});

const userBody = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["admin", "agent"]).default("agent"),
  phone: z.string().optional(),
});

const userUpdateBody = z.object({
  name: z.string().trim().min(2).optional(),
  /** Vazio ou null remove o WhatsApp: o usuário deixa de ser remetente autorizado. */
  phone: z.string().nullable().optional(),
});

function phoneOrThrow(raw?: string | null) {
  if (!raw) return null;
  const p = normalizePhoneE164(raw);
  if (!p) throw new DomainError("invalid_phone", "Telefone inválido");
  return p;
}

export function registerAuthRoutes(app: FastifyInstance, deps: AppDeps) {
  /** Cadastro self-service (POC): cria a organização e o usuário dono. */
  app.post("/auth/register", async (req, reply) => {
    const b = registerBody.parse(req.body);
    const phone = phoneOrThrow(b.phone);
    try {
      const { tenant, user } = await deps.db.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({ data: { name: b.tenantName, tradeName: b.tradeName ?? null, contactPhone: phone } });
        const user = await tx.user.create({
          data: { tenantId: tenant.id, name: b.name, email: b.email.toLowerCase(), passwordHash: await hashPassword(b.password), role: "owner", phoneE164: phone },
        });
        return { tenant, user };
      });
      const token = app.jwt.sign({ sub: user.id, tid: tenant.id, role: user.role });
      return reply.status(201).send({ token, tenantId: tenant.id, userId: user.id });
    } catch (err) {
      if (isUniqueViolation(err)) throw new DomainError("email_taken", "E-mail já cadastrado", 409);
      throw err;
    }
  });

  app.post("/auth/login", async (req) => {
    const b = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
    const user = await deps.db.user.findUnique({ where: { email: b.email.toLowerCase() }, include: { tenant: true } });
    if (!user || user.status !== "active" || user.tenant.status !== "active" || !(await verifyPassword(b.password, user.passwordHash))) {
      throw new DomainError("invalid_credentials", "E-mail ou senha inválidos", 401);
    }
    return { token: app.jwt.sign({ sub: user.id, tid: user.tenantId, role: user.role }), tenantId: user.tenantId, role: user.role };
  });

  app.get("/me", { preHandler: requireAuth }, async (req) => {
    const user = await deps.db.user.findFirstOrThrow({
      where: { id: req.auth.userId, tenantId: req.auth.tenantId },
      select: { id: true, name: true, email: true, role: true, phoneE164: true, tenant: true },
    });
    return user;
  });

  app.get("/users", { preHandler: requireAuth }, async (req) =>
    deps.db.user.findMany({
      where: { tenantId: req.auth.tenantId },
      select: { id: true, name: true, email: true, role: true, phoneE164: true, status: true },
    }),
  );

  /** Usuários com telefone são os remetentes autorizados no canal de entrada. */
  app.post("/users", { preHandler: [requireAuth, requireRole("owner", "admin")] }, async (req, reply) => {
    const b = userBody.parse(req.body);
    try {
      const user = await deps.db.user.create({
        data: {
          tenantId: req.auth.tenantId,
          name: b.name,
          email: b.email.toLowerCase(),
          passwordHash: await hashPassword(b.password),
          role: b.role,
          phoneE164: phoneOrThrow(b.phone),
        },
        select: { id: true, name: true, email: true, role: true, phoneE164: true },
      });
      await audit(deps.db, req.auth.tenantId, { type: "user", id: req.auth.userId }, "user.created", "user", user.id, { role: b.role });
      return reply.status(201).send(user);
    } catch (err) {
      if (isUniqueViolation(err)) throw new DomainError("conflict", "E-mail ou telefone já cadastrado", 409);
      throw err;
    }
  });

  app.patch<{ Params: { id: string } }>("/users/:id", { preHandler: [requireAuth, requireRole("owner", "admin")] }, async (req) => {
    const b = userUpdateBody.parse(req.body);
    const tenantId = req.auth.tenantId;
    const current = await deps.db.user.findFirst({ where: { id: req.params.id, tenantId }, select: { id: true, phoneE164: true } });
    if (!current) throw new NotFoundError("Usuário");
    const phone = b.phone === undefined ? undefined : phoneOrThrow(b.phone?.trim() || null);
    try {
      const user = await deps.db.user.update({
        where: { id: current.id },
        data: { ...(b.name ? { name: b.name } : {}), ...(phone !== undefined ? { phoneE164: phone } : {}) },
        select: { id: true, name: true, email: true, role: true, phoneE164: true, status: true },
      });
      await audit(deps.db, tenantId, { type: "user", id: req.auth.userId }, "user.updated", "user", user.id, {
        name: b.name ? true : undefined,
        phoneChanged: phone !== undefined && phone !== current.phoneE164,
      });
      return user;
    } catch (err) {
      if (isUniqueViolation(err)) throw new DomainError("conflict", "Este WhatsApp já está cadastrado em outro usuário", 409);
      throw err;
    }
  });
}
