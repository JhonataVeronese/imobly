import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { audit, isUniqueViolation, type Actor, type AppDeps } from "../../application/deps.js";
import {
  createProviderAccount,
  providerAccountPublicFields,
  rotateProviderWebhook,
  updateProviderAccount,
} from "../../application/provider-accounts.js";
import { createTenantUser, phoneOrThrow, updateTenantUser, userCreateBody, userPublicFields } from "../../application/tenant-users.js";
import { DomainError, NotFoundError } from "../../domain/errors.js";
import { hashPassword, requirePlatformAdmin } from "../auth.js";

const tenantFields = {
  name: z.string().trim().min(2),
  tradeName: z.string().trim().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  monthlyMessageLimit: z.number().int().min(0).max(10_000_000).optional(),
};

const tenantCreateBody = z.object({ ...tenantFields, user: userCreateBody });
const tenantUpdateBody = z.object({
  ...tenantFields,
  name: tenantFields.name.optional(),
  status: z.enum(["active", "suspended"]).optional(),
});

type TenantParams = { Params: { tenantId: string } };
type TenantItemParams = { Params: { tenantId: string; id: string } };

/**
 * Área do administrador da plataforma: cadastra clientes (imobiliárias), os corretores de cada um
 * e as conexões de WhatsApp. Aqui o tenant vem da URL — só este perfil passa pelo preHandler.
 */
export function registerAdminRoutes(app: FastifyInstance, deps: AppDeps) {
  const admin = { preHandler: requirePlatformAdmin };
  const actor = (req: FastifyRequest): Actor => ({ type: "user", id: req.platformAuth.userId });

  async function tenantOr404(tenantId: string) {
    if (!z.string().uuid().safeParse(tenantId).success) throw new NotFoundError("Cliente");
    const t = await deps.db.tenant.findUnique({ where: { id: tenantId } });
    if (!t) throw new NotFoundError("Cliente");
    return t;
  }

  app.get("/admin/tenants", admin, async () =>
    deps.db.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { users: true, providerAccounts: true, campaigns: true, contacts: true } } },
    }),
  );

  /** Cria a imobiliária já com o primeiro corretor (sem ele, ninguém consegue entrar). */
  app.post("/admin/tenants", admin, async (req, reply) => {
    const b = tenantCreateBody.parse(req.body);
    const contactPhone = phoneOrThrow(b.contactPhone ?? b.user.phone);
    const passwordHash = await hashPassword(b.user.password);
    try {
      const tenant = await deps.db.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: b.name,
            tradeName: b.tradeName ?? null,
            contactPhone,
            ...(b.monthlyMessageLimit !== undefined ? { monthlyMessageLimit: b.monthlyMessageLimit } : {}),
          },
        });
        const user = await tx.user.create({
          data: {
            tenantId: tenant.id,
            name: b.user.name,
            email: b.user.email.toLowerCase(),
            passwordHash,
            role: "agent",
            phoneE164: phoneOrThrow(b.user.phone),
          },
        });
        await audit(tx, tenant.id, actor(req), "tenant.created", "tenant", tenant.id, { firstUserId: user.id });
        return tenant;
      });
      return reply.status(201).send(tenant);
    } catch (err) {
      if (isUniqueViolation(err)) throw new DomainError("conflict", "E-mail do corretor já cadastrado", 409);
      throw err;
    }
  });

  app.get<TenantParams>("/admin/tenants/:tenantId", admin, async (req) => {
    await tenantOr404(req.params.tenantId);
    return deps.db.tenant.findUniqueOrThrow({
      where: { id: req.params.tenantId },
      include: { _count: { select: { users: true, providerAccounts: true, campaigns: true, contacts: true } } },
    });
  });

  app.patch<TenantParams>("/admin/tenants/:tenantId", admin, async (req) => {
    const t = await tenantOr404(req.params.tenantId);
    const b = tenantUpdateBody.parse(req.body);
    const data = {
      ...(b.name ? { name: b.name } : {}),
      ...(b.tradeName !== undefined ? { tradeName: b.tradeName || null } : {}),
      ...(b.contactPhone !== undefined ? { contactPhone: phoneOrThrow(b.contactPhone) } : {}),
      ...(b.monthlyMessageLimit !== undefined ? { monthlyMessageLimit: b.monthlyMessageLimit } : {}),
      ...(b.status ? { status: b.status } : {}),
    };
    const updated = await deps.db.tenant.update({ where: { id: t.id }, data });
    await audit(deps.db, t.id, actor(req), "tenant.updated", "tenant", t.id, { fields: Object.keys(data) });
    return updated;
  });

  // Corretores do cliente
  app.get<TenantParams>("/admin/tenants/:tenantId/users", admin, async (req) => {
    await tenantOr404(req.params.tenantId);
    return deps.db.user.findMany({ where: { tenantId: req.params.tenantId }, select: userPublicFields, orderBy: { createdAt: "asc" } });
  });
  app.post<TenantParams>("/admin/tenants/:tenantId/users", admin, async (req, reply) => {
    await tenantOr404(req.params.tenantId);
    return reply.status(201).send(await createTenantUser(deps, req.params.tenantId, req.body, actor(req)));
  });
  app.patch<TenantItemParams>("/admin/tenants/:tenantId/users/:id", admin, async (req) => {
    await tenantOr404(req.params.tenantId);
    return updateTenantUser(deps, req.params.tenantId, req.params.id, req.body, actor(req));
  });

  // Conexões de WhatsApp do cliente
  app.get<TenantParams>("/admin/tenants/:tenantId/provider-accounts", admin, async (req) => {
    await tenantOr404(req.params.tenantId);
    return deps.db.providerAccount.findMany({ where: { tenantId: req.params.tenantId }, select: providerAccountPublicFields, orderBy: { createdAt: "asc" } });
  });
  app.post<TenantParams>("/admin/tenants/:tenantId/provider-accounts", admin, async (req, reply) => {
    await tenantOr404(req.params.tenantId);
    return reply.status(201).send(await createProviderAccount(deps, req.params.tenantId, req.body, actor(req)));
  });
  app.patch<TenantItemParams>("/admin/tenants/:tenantId/provider-accounts/:id", admin, async (req) => {
    await tenantOr404(req.params.tenantId);
    return updateProviderAccount(deps, req.params.tenantId, req.params.id, req.body, actor(req));
  });
  app.post<TenantItemParams>("/admin/tenants/:tenantId/provider-accounts/:id/rotate-webhook", admin, async (req) => {
    await tenantOr404(req.params.tenantId);
    return rotateProviderWebhook(deps, req.params.tenantId, req.params.id, actor(req));
  });

  /** Diagnóstico: últimos webhooks recebidos pelos números do cliente (payload bruto). */
  app.get<TenantParams & { Querystring: { limit?: string } }>("/admin/tenants/:tenantId/webhook-events", admin, async (req) => {
    await tenantOr404(req.params.tenantId);
    return deps.db.webhookEvent.findMany({
      where: { tenantId: req.params.tenantId },
      orderBy: { receivedAt: "desc" },
      take: Math.min(Number(req.query.limit ?? 50) || 50, 200),
    });
  });

  app.get<TenantParams>("/admin/tenants/:tenantId/audit-logs", admin, async (req) => {
    await tenantOr404(req.params.tenantId);
    return deps.db.auditLog.findMany({ where: { tenantId: req.params.tenantId }, orderBy: { createdAt: "desc" }, take: 200 });
  });
}
