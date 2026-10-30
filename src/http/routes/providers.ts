import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../application/deps.js";
import { providerAccountPublicFields } from "../../application/provider-accounts.js";
import { requireAuth } from "../auth.js";

/** Corretor só consulta os números da imobiliária; cadastro e manutenção ficam em `/admin`. */
export function registerProviderRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get("/provider-accounts", { preHandler: requireAuth }, async (req) =>
    deps.db.providerAccount.findMany({ where: { tenantId: req.auth.tenantId }, select: providerAccountPublicFields }),
  );
}
