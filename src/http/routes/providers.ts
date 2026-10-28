import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit, type AppDeps } from "../../application/deps.js";
import { generateWebhookToken } from "../../application/webhook-intake.js";
import { DomainError, NotFoundError } from "../../domain/errors.js";
import { requireAuth, requireRole } from "../auth.js";
import { registerOmniAccount, rotateOmniWebhookUrl } from "../../application/omni-setup.js";

const body = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("zapi"),
    instanceId: z.string().min(5),
    instanceToken: z.string().min(5),
    clientToken: z.string().optional(),
    inboundMode: z.enum(["group", "direct"]).default("group"),
    inboundChatId: z.string().optional(),
  }),
  z.object({
    provider: z.literal("omni"),
    channelId: z.string().trim().min(8),
    secretKey: z.string().trim().min(10),
    inboundMode: z.enum(["group", "direct"]).default("direct"),
    inboundChatId: z.string().optional(),
  }),
  z.object({
    provider: z.literal("fake"),
    inboundMode: z.enum(["group", "direct"]).default("group"),
    inboundChatId: z.string().optional(),
  }),
]);

const publicFields = {
  id: true,
  provider: true,
  accountReference: true,
  status: true,
  inboundMode: true,
  inboundChatId: true,
  createdAt: true,
} as const;

export function registerProviderRoutes(app: FastifyInstance, deps: AppDeps) {
  const admin = { preHandler: [requireAuth, requireRole("owner", "admin")] };

  app.get("/provider-accounts", { preHandler: requireAuth }, async (req) =>
    deps.db.providerAccount.findMany({ where: { tenantId: req.auth.tenantId }, select: publicFields }),
  );

  /**
   * Configura a integração. Credenciais vão cifradas para o cofre; a URL do webhook
   * (com token secreto) é retornada UMA vez — guardamos apenas o hash.
   */
  app.post("/provider-accounts", admin, async (req, reply) => {
    const b = body.parse(req.body);
    const tenantId = req.auth.tenantId;
    if (b.inboundMode === "group" && !b.inboundChatId) {
      throw new DomainError("inbound_chat_required", "Informe o id do grupo de entrada (inboundChatId), ex.: 1203...-group");
    }
    if (b.provider === "omni") {
      // O webhook é criado na Omni automaticamente (assinado); a URL não precisa ser configurada à mão.
      const { account, webhookUrl } = await registerOmniAccount(deps, tenantId, b, { type: "user", id: req.auth.userId });
      const publicAccount = await deps.db.providerAccount.findUniqueOrThrow({ where: { id: account.id }, select: publicFields });
      return reply.status(201).send({
        ...publicAccount,
        webhookUrl,
        note: "Webhook cadastrado na Omni automaticamente, com assinatura. Não é preciso configurar nada no painel da Omni.",
      });
    }
    const { token, hash } = generateWebhookToken();
    const configurationRef =
      b.provider === "zapi" ? await deps.secrets.put(tenantId, { instanceToken: b.instanceToken, ...(b.clientToken ? { clientToken: b.clientToken } : {}) }) : null;
    const account = await deps.db.providerAccount.create({
      data: {
        tenantId,
        provider: b.provider,
        accountReference: b.provider === "zapi" ? b.instanceId : `fake-${tenantId.slice(0, 8)}`,
        inboundMode: b.inboundMode,
        inboundChatId: b.inboundChatId ?? null,
        webhookTokenHash: hash,
        configurationRef,
      },
      select: publicFields,
    });
    await audit(deps.db, tenantId, { type: "user", id: req.auth.userId }, "provider_account.created", "provider_account", account.id, {
      provider: b.provider,
    });
    return reply.status(201).send({
      ...account,
      webhookUrl: `${deps.config.PUBLIC_BASE_URL}/webhooks/${b.provider}/${token}`,
      note: "Guarde esta URL: ela não será exibida novamente. Configure-a nos webhooks de recebimento e de status da instância.",
    });
  });

  app.patch<{ Params: { id: string } }>("/provider-accounts/:id", admin, async (req) => {
    const b = z
      .object({ status: z.enum(["active", "disabled"]).optional(), inboundChatId: z.string().nullable().optional(), inboundMode: z.enum(["group", "direct"]).optional() })
      .parse(req.body);
    const r = await deps.db.providerAccount.updateMany({ where: { id: req.params.id, tenantId: req.auth.tenantId }, data: b });
    if (!r.count) throw new NotFoundError("Integração");
    await audit(deps.db, req.auth.tenantId, { type: "user", id: req.auth.userId }, "provider_account.updated", "provider_account", req.params.id, b);
    return deps.db.providerAccount.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId }, select: publicFields });
  });

  /** Rotaciona o token do webhook (ex.: suspeita de vazamento). */
  app.post<{ Params: { id: string } }>("/provider-accounts/:id/rotate-webhook", admin, async (req) => {
    const { token, hash } = generateWebhookToken();
    const current = await deps.db.providerAccount.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!current) throw new NotFoundError("Integração");
    if (current.provider === "omni" && current.configurationRef) {
      const url = `${deps.config.PUBLIC_BASE_URL}/webhooks/omni/${token}`;
      await rotateOmniWebhookUrl(deps, current.tenantId, current.accountReference, current.configurationRef, url);
    }
    const r = await deps.db.providerAccount.updateMany({ where: { id: req.params.id, tenantId: req.auth.tenantId }, data: { webhookTokenHash: hash } });
    if (!r.count) throw new NotFoundError("Integração");
    const acc = await deps.db.providerAccount.findFirstOrThrow({ where: { id: req.params.id } });
    await audit(deps.db, req.auth.tenantId, { type: "user", id: req.auth.userId }, "provider_account.webhook_rotated", "provider_account", acc.id);
    return { webhookUrl: `${deps.config.PUBLIC_BASE_URL}/webhooks/${acc.provider}/${token}` };
  });

  /** Diagnóstico da Fase 0: últimos eventos recebidos (payload bruto) para validar o comportamento do provedor. */
  app.get<{ Querystring: { limit?: string } }>("/webhook-events", admin, async (req) =>
    deps.db.webhookEvent.findMany({
      where: { tenantId: req.auth.tenantId },
      orderBy: { receivedAt: "desc" },
      take: Math.min(Number(req.query.limit ?? 50), 200),
    }),
  );
}
