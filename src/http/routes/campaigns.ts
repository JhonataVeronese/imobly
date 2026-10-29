import type { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  campaignMetrics,
  cancelCampaign,
  confirmCampaign,
  createCampaign,
  listSelectableContacts,
  parseAudience,
  pauseCampaign,
  refreshEstimate,
  resumeCampaign,
} from "../../application/campaign-service.js";
import type { AppDeps } from "../../application/deps.js";
import { DomainError, NotFoundError } from "../../domain/errors.js";
import { MESSAGE_STATUSES } from "../../domain/message-status.js";
import { requireAuth } from "../auth.js";

const createBody = z.object({
  propertyId: z.string().uuid(),
  name: z.string().min(2).optional(),
  audience: z.unknown().optional(),
  messageTemplate: z.string().optional(),
  providerAccountId: z.string().uuid().optional(),
});

const updateAudienceBody = z.object({
  contactIds: z.array(z.string().uuid()).max(5000),
});

export function registerCampaignRoutes(app: FastifyInstance, deps: AppDeps) {
  const auth = { preHandler: requireAuth };
  const actor = (req: { auth: { userId: string } }) => ({ type: "user" as const, id: req.auth.userId });

  app.get("/campaigns", auth, async (req) => {
    const items = await deps.db.campaign.findMany({
      where: { tenantId: req.auth.tenantId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { property: { select: { title: true, price: true } } },
    });
    return Promise.all(items.map(async (c) => ({ ...c, metrics: await campaignMetrics(deps.db, req.auth.tenantId, c.id) })));
  });

  app.post("/campaigns", auth, async (req, reply) => {
    const b = createBody.parse(req.body);
    return reply.status(201).send(await createCampaign(deps, req.auth.tenantId, b, actor(req)));
  });

  app.get<{ Params: { id: string } }>("/campaigns/:id", auth, async (req) => {
    const c = await deps.db.campaign.findFirst({
      where: { id: req.params.id, tenantId: req.auth.tenantId },
      include: { property: { include: { assets: { select: { id: true, kind: true, originalName: true } } } } },
    });
    if (!c) throw new NotFoundError("Campanha");
    return { ...c, metrics: await campaignMetrics(deps.db, req.auth.tenantId, c.id) };
  });

  app.get<{ Params: { id: string }; Querystring: { page?: string; q?: string } }>("/campaigns/:id/eligible-contacts", auth, async (req) =>
    listSelectableContacts(deps, req.auth.tenantId, req.params.id, Math.max(1, Number(req.query.page ?? 1) || 1), req.query.q),
  );

  // Seleção manual do público: lista vazia volta ao público automático do imóvel.
  app.patch<{ Params: { id: string } }>("/campaigns/:id", auth, async (req) => {
    const tenantId = req.auth.tenantId;
    const { contactIds } = updateAudienceBody.parse(req.body);
    const c = await deps.db.campaign.findFirst({ where: { id: req.params.id, tenantId } });
    if (!c) throw new NotFoundError("Campanha");
    if (c.status !== "awaiting_confirmation" && c.status !== "draft") {
      throw new DomainError("invalid_transition", "O público só pode ser alterado antes da confirmação", 409);
    }
    const { contactIds: _previous, ...rest } = parseAudience(c.audience);
    const audience = contactIds.length ? { ...rest, contactIds } : rest;
    await deps.db.campaign.update({ where: { id: c.id }, data: { audience: audience as Prisma.InputJsonValue } });
    return refreshEstimate(deps, tenantId, c.id);
  });

  app.post<{ Params: { id: string } }>("/campaigns/:id/confirm", auth, async (req) => confirmCampaign(deps, req.auth.tenantId, req.params.id, actor(req)));
  app.post<{ Params: { id: string } }>("/campaigns/:id/pause", auth, async (req) => pauseCampaign(deps, req.auth.tenantId, req.params.id, actor(req)));
  app.post<{ Params: { id: string } }>("/campaigns/:id/resume", auth, async (req) => resumeCampaign(deps, req.auth.tenantId, req.params.id, actor(req)));
  app.post<{ Params: { id: string } }>("/campaigns/:id/cancel", auth, async (req) => cancelCampaign(deps, req.auth.tenantId, req.params.id, actor(req)));

  app.get<{ Params: { id: string }; Querystring: { status?: string; page?: string } }>("/campaigns/:id/recipients", auth, async (req) => {
    const tenantId = req.auth.tenantId;
    const c = await deps.db.campaign.findFirst({ where: { id: req.params.id, tenantId }, select: { id: true } });
    if (!c) throw new NotFoundError("Campanha");
    const status = z.enum(MESSAGE_STATUSES).optional().parse(req.query.status || undefined);
    const page = Math.max(1, Number(req.query.page ?? 1));
    const where = { tenantId, campaignId: c.id, ...(status ? { status } : {}) };
    const [items, total] = await Promise.all([
      deps.db.campaignRecipient.findMany({
        where,
        orderBy: { queuedAt: "asc" },
        skip: (page - 1) * 100,
        take: 100,
        include: { contact: { select: { name: true } }, messages: { select: { part: true, kind: true, status: true, errorCode: true } } },
      }),
      deps.db.campaignRecipient.count({ where }),
    ]);
    return { items, total, page };
  });
}
