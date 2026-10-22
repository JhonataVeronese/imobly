import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { refreshEstimate } from "../../application/campaign-service.js";
import type { AppDeps } from "../../application/deps.js";
import { saveAssetBuffer } from "../../application/property-intake.js";
import { DomainError, NotFoundError } from "../../domain/errors.js";
import { requireAuth } from "../auth.js";

const propertyBody = z.object({
  title: z.string().min(2).nullable().optional(),
  description: z.string().nullable().optional(),
  propertyType: z.string().nullable().optional(),
  transaction: z.enum(["venda", "aluguel"]).nullable().optional(),
  price: z.number().nonnegative().nullable().optional(),
  city: z.string().nullable().optional(),
  neighborhood: z.string().nullable().optional(),
  bedrooms: z.number().int().nonnegative().nullable().optional(),
  suites: z.number().int().nonnegative().nullable().optional(),
  bathrooms: z.number().int().nonnegative().nullable().optional(),
  parkingSpaces: z.number().int().nonnegative().nullable().optional(),
  areaM2: z.number().positive().nullable().optional(),
});

export function registerPropertyRoutes(app: FastifyInstance, deps: AppDeps) {
  const auth = { preHandler: requireAuth };

  app.get("/properties", auth, async (req) =>
    deps.db.property.findMany({
      where: { tenantId: req.auth.tenantId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { assets: { select: { id: true, kind: true, mimeType: true, sizeBytes: true, originalName: true } } },
    }),
  );

  app.get<{ Params: { id: string } }>("/properties/:id", auth, async (req) => {
    const p = await deps.db.property.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId }, include: { assets: true } });
    if (!p) throw new NotFoundError("Imóvel");
    const assets = await Promise.all(
      p.assets.map(async (a) => ({ ...a, url: await deps.storage.signedUrl(a.storageKey, 600) })),
    );
    return { ...p, assets };
  });

  /** Entrada alternativa (formulário web) — o restante do fluxo é o mesmo do WhatsApp. */
  app.post("/properties", auth, async (req, reply) => {
    const b = propertyBody.parse(req.body);
    const p = await deps.db.property.create({
      data: { tenantId: req.auth.tenantId, createdByUserId: req.auth.userId, status: "draft", ...b },
    });
    return reply.status(201).send(p);
  });

  /** Correção dos dados extraídos antes do envio. Campos omitidos não mudam; null limpa. */
  app.patch<{ Params: { id: string } }>("/properties/:id", auth, async (req) => {
    const b = propertyBody.parse(req.body);
    const r = await deps.db.property.updateMany({ where: { id: req.params.id, tenantId: req.auth.tenantId }, data: b });
    if (!r.count) throw new NotFoundError("Imóvel");
    const pending = await deps.db.campaign.findMany({
      where: { tenantId: req.auth.tenantId, propertyId: req.params.id, status: "awaiting_confirmation" },
    });
    for (const c of pending) await refreshEstimate(deps, req.auth.tenantId, c.id);
    return deps.db.property.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId }, include: { assets: true } });
  });

  app.post<{ Params: { id: string } }>("/properties/:id/assets", auth, async (req, reply) => {
    const p = await deps.db.property.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!p) throw new NotFoundError("Imóvel");
    const saved = [];
    for await (const file of req.files()) {
      const buf = await file.toBuffer();
      if (file.file.truncated) throw new DomainError("file_too_large", "Arquivo acima do limite");
      saved.push(await saveAssetBuffer(deps, req.auth.tenantId, p.id, buf, file.filename, null));
    }
    return reply.status(201).send(saved);
  });

  /** Troca de anexos: remove um arquivo (só enquanto não houver campanha em andamento). */
  app.delete<{ Params: { id: string; assetId: string } }>("/properties/:id/assets/:assetId", auth, async (req, reply) => {
    const tenantId = req.auth.tenantId;
    const asset = await deps.db.propertyAsset.findFirst({ where: { id: req.params.assetId, propertyId: req.params.id, tenantId } });
    if (!asset) throw new NotFoundError("Arquivo");
    const running = await deps.db.campaign.count({
      where: { tenantId, propertyId: req.params.id, status: { in: ["processing", "paused", "scheduled"] } },
    });
    if (running) throw new DomainError("campaign_running", "Há campanha em andamento usando este arquivo", 409);
    await deps.db.propertyAsset.delete({ where: { id: asset.id } });
    await deps.storage.delete(asset.storageKey).catch(() => undefined);
    return reply.status(204).send();
  });
}
