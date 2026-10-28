import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../application/deps.js";
import { receiveWebhook } from "../../application/webhook-intake.js";

export function registerWebhookRoutes(app: FastifyInstance, deps: AppDeps) {
  // A URL completa (com token) é exibida uma única vez ao configurar a integração.
  app.post<{ Params: { provider: string; token: string } }>("/webhooks/:provider/:token", async (req, reply) => {
    const r = await receiveWebhook(deps, req.params.provider, req.params.token, req.body, {
      rawBody: req.rawBody,
      headers: req.headers,
    });
    // Duplicado responde 200: o provedor não deve continuar reenviando.
    return reply.status(200).send(r);
  });
}
