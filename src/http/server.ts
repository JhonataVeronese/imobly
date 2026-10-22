import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import type { AppDeps } from "../application/deps.js";
import { DomainError } from "../domain/errors.js";
import type { LocalDiskStorage } from "../infra/storage/storage.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCampaignRoutes } from "./routes/campaigns.js";
import { registerContactRoutes } from "./routes/contacts.js";
import { registerPropertyRoutes } from "./routes/properties.js";
import { registerProviderRoutes } from "./routes/providers.js";
import { registerSimulatorRoutes } from "./routes/simulator.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";

export interface ServerOptions {
  jwtSecret: string;
  localStorage?: LocalDiskStorage | null;
  logger?: boolean | object;
}

export async function buildServer(deps: AppDeps, opts: ServerOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? false,
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: true,
  });

  await app.register(jwt, { secret: opts.jwtSecret, sign: { expiresIn: "12h" } });
  await app.register(multipart, {
    limits: { fileSize: Math.max(deps.config.MAX_IMAGE_BYTES, deps.config.MAX_DOCUMENT_BYTES), files: 10 },
  });
  app.addContentTypeParser("text/csv", { parseAs: "string", bodyLimit: 10 * 1024 * 1024 }, (_req, body, done) => done(null, body));

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof DomainError) return reply.status(err.httpStatus).send({ error: err.code, message: err.message });
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: "invalid_payload", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.status(status).send({ error: "bad_request", message: (err as Error).message });
    req.log.error({ err }, "erro não tratado");
    return reply.status(500).send({ error: "internal_error" });
  });

  app.get("/health", async () => {
    await deps.db.$queryRaw`SELECT 1`;
    return { ok: true };
  });

  registerWebhookRoutes(app, deps);
  registerAuthRoutes(app, deps);
  registerProviderRoutes(app, deps);
  registerContactRoutes(app, deps);
  registerPropertyRoutes(app, deps);
  registerCampaignRoutes(app, deps);
  registerSimulatorRoutes(app, deps);

  // URLs assinadas do storage local (dev). Em S3 o próprio bucket serve as URLs assinadas.
  const local = opts.localStorage;
  if (local) {
    app.get<{ Params: { "*": string }; Querystring: { exp?: string; sig?: string } }>("/files/*", async (req, reply) => {
      const key = req.params["*"].split("/").map(decodeURIComponent).join("/");
      if (!local.verify(key, Number(req.query.exp), req.query.sig ?? "")) return reply.status(403).send({ error: "forbidden" });
      const buf = await local.get(key).catch(() => null);
      if (!buf) return reply.status(404).send({ error: "not_found" });
      const type = key.endsWith(".pdf") ? "application/pdf" : key.endsWith(".png") ? "image/png" : "image/jpeg";
      return reply.type(type).header("cache-control", "private, max-age=300").send(buf);
    });
  }

  return app;
}
