import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  campaignMetrics,
  cancelCampaign,
  confirmCampaign,
  createCampaign,
  findEligibleContacts,
  parseAudience,
  pauseCampaign,
  refreshEstimate,
  resumeCampaign,
} from "../../application/campaign-service.js";
import type { AppDeps } from "../../application/deps.js";
import { NotFoundError } from "../../domain/errors.js";
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
  audience: z.unknown().optional(),
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

  app.get<{ Params: { id: string }; Querystring: { page?: string } }>("/campaigns/:id/eligible-contacts", auth, async (req) => {
    const tenantId = req.auth.tenantId;
    const c = await deps.db.campaign.findFirst({
      where: { id: req.params.id, tenantId },
      include: { property: true },
    });
    if (!c) throw new NotFoundError("Campanha");
    if (!c.property) throw new NotFoundError("Imóvel");

    const eligible = await findEligibleContacts(deps.db, tenantId, parseAudience(c.audience), c.property);
    const page = Math.max(1, Number(req.query.page ?? 1));
    const start = (page - 1) * 50;
    const items = eligible.slice(start, start + 50);

    return {
      items: await deps.db.contact.findMany({
        where: { id: { in: items.map(c => c.id) }, tenantId },
        select: { id: true, name: true, phoneE164: true },
      }),
      total: eligible.length,
      page,
    };
  });

  app.patch<{ Params: { id: string } }>("/campaigns/:id", auth, async (req) => {
    const tenantId = req.auth.tenantId;
    const b = updateAudienceBody.parse(req.body);
    const c = await deps.db.campaign.findFirst({ where: { id: req.params.id, tenantId } });
    if (!c) throw new NotFoundError("Campanha");
    if (c.status !== "awaiting_confirmation" && c.status !== "draft") {
      throw new NotFoundError("Campanha");
    }

    const audience = b.audience !== undefined ? b.audience : c.audience;
    const updated = await deps.db.campaign.update({
      where: { id: req.params.id },
      data: { audience },
    });

    await refreshEstimate(deps, tenantId, req.params.id);
    return updated;
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
