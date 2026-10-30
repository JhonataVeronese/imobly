import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { grantConsent, optOutByPhone } from "../../application/consent-service.js";
import { importContactsCsv } from "../../application/contacts-service.js";
import { audit, isUniqueViolation, type AppDeps } from "../../application/deps.js";
import { contactPreferencesSchema } from "../../domain/audience.js";
import { DomainError, NotFoundError } from "../../domain/errors.js";
import { normalizePhoneE164 } from "../../domain/phone.js";
import { requireAuth } from "../auth.js";

const listQuery = z.object({
  status: z.enum(["active", "opted_out", "blocked"]).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

const contactBody = z.object({
  name: z.string().min(1),
  phone: z.string(),
  preferences: contactPreferencesSchema.optional(),
  tags: z.array(z.string()).optional(),
});

const patchBody = z.object({
  name: z.string().min(1).optional(),
  preferences: contactPreferencesSchema.optional(),
  tags: z.array(z.string()).optional(),
  blocked: z.boolean().optional(),
});

const consentBody = z.object({
  source: z.string().min(2),
  evidenceReference: z.string().min(2),
  scope: z.string().optional(),
  grantedAt: z.coerce.date().optional(),
  overrideSuppression: z.boolean().optional(),
});

export function registerContactRoutes(app: FastifyInstance, deps: AppDeps) {
  const auth = { preHandler: requireAuth };

  app.get("/contacts", auth, async (req) => {
    const q = listQuery.parse(req.query);
    const where = {
      tenantId: req.auth.tenantId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: "insensitive" as const } }, { phoneE164: { contains: q.q } }] } : {}),
    };
    const [items, total] = await Promise.all([
      deps.db.contact.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { consents: { where: { revokedAt: null }, select: { id: true, source: true, grantedAt: true } } },
      }),
      deps.db.contact.count({ where }),
    ]);
    return { items: items.map((c) => ({ ...c, hasConsent: c.consents.length > 0 })), total, page: q.page };
  });

  app.post("/contacts", auth, async (req, reply) => {
    const b = contactBody.parse(req.body);
    const phone = normalizePhoneE164(b.phone);
    if (!phone) throw new DomainError("invalid_phone", "Telefone inválido");
    const suppressed = await deps.db.suppressionEntry.findUnique({ where: { tenantId_phoneE164: { tenantId: req.auth.tenantId, phoneE164: phone } } });
    try {
      const c = await deps.db.contact.create({
        data: {
          tenantId: req.auth.tenantId,
          name: b.name,
          phoneE164: phone,
          source: "manual",
          preferences: b.preferences ?? {},
          tags: b.tags ?? [],
          status: suppressed ? "opted_out" : "active",
        },
      });
      return reply.status(201).send(c);
    } catch (err) {
      if (isUniqueViolation(err)) throw new DomainError("contact_exists", "Contato já existe", 409);
      throw err;
    }
  });

  /** Importação CSV (Content-Type: text/csv). Não registra consentimento sem evidência por linha. */
  app.post<{ Querystring: { fileName?: string } }>("/contacts/import", auth, async (req) => {
    if (typeof req.body !== "string") throw new DomainError("csv_required", "Envie o CSV com Content-Type: text/csv", 415);
    return importContactsCsv(deps.db, req.auth.tenantId, req.body, req.query.fileName ?? "upload.csv", { type: "user", id: req.auth.userId });
  });

  app.patch<{ Params: { id: string } }>("/contacts/:id", auth, async (req) => {
    const b = patchBody.parse(req.body);
    const tenantId = req.auth.tenantId;
    const contact = await deps.db.contact.findFirst({ where: { id: req.params.id, tenantId } });
    if (!contact) throw new NotFoundError("Contato");
    const data: Record<string, unknown> = {};
    if (b.name) data.name = b.name;
    if (b.preferences) data.preferences = b.preferences;
    if (b.tags) data.tags = b.tags;
    if (b.blocked === true) data.status = "blocked";
    if (b.blocked === false && contact.status === "blocked") data.status = "active";
    const updated = await deps.db.contact.update({ where: { id: contact.id }, data });
    if (b.blocked !== undefined) {
      await audit(deps.db, tenantId, { type: "user", id: req.auth.userId }, b.blocked ? "contact.blocked" : "contact.unblocked", "contact", contact.id);
    }
    return updated;
  });

  app.get<{ Params: { id: string } }>("/contacts/:id/consents", auth, async (req) => {
    const contact = await deps.db.contact.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!contact) throw new NotFoundError("Contato");
    return deps.db.contactConsent.findMany({ where: { tenantId: req.auth.tenantId, contactId: contact.id }, orderBy: { createdAt: "desc" } });
  });

  app.post<{ Params: { id: string } }>("/contacts/:id/consent", auth, async (req, reply) => {
    const b = consentBody.parse(req.body);
    // Reativar descadastrado exige evidência nova e fica auditado (grantConsent).
    const consent = await grantConsent(deps.db, req.auth.tenantId, req.params.id, b, { type: "user", id: req.auth.userId });
    return reply.status(201).send(consent);
  });

  app.post<{ Params: { id: string } }>("/contacts/:id/opt-out", auth, async (req) => {
    const b = z.object({ reason: z.string().optional() }).parse(req.body ?? {});
    const contact = await deps.db.contact.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!contact) throw new NotFoundError("Contato");
    return optOutByPhone(deps.db, req.auth.tenantId, contact.phoneE164, { source: `panel:${req.auth.userId}`, reason: b.reason ?? "manual" }, {
      type: "user",
      id: req.auth.userId,
    });
  });

  app.get("/suppression-list", auth, async (req) =>
    deps.db.suppressionEntry.findMany({ where: { tenantId: req.auth.tenantId }, orderBy: { createdAt: "desc" }, take: 500 }),
  );
}
