import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../../application/deps.js";
import { DomainError } from "../../domain/errors.js";
import { requireSession, verifyPassword } from "../auth.js";

/** Clientes (tenants) e usuários são cadastrados pelo administrador da plataforma em `/admin`. */
export function registerAuthRoutes(app: FastifyInstance, deps: AppDeps) {
  app.post("/auth/login", async (req) => {
    const b = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
    const user = await deps.db.user.findUnique({ where: { email: b.email.toLowerCase() }, include: { tenant: true } });
    const tenantOk = user?.role === "platform_admin" ? true : user?.tenant?.status === "active";
    if (!user || user.status !== "active" || !tenantOk || !(await verifyPassword(b.password, user.passwordHash))) {
      throw new DomainError("invalid_credentials", "E-mail ou senha inválidos", 401);
    }
    return { token: app.jwt.sign({ sub: user.id, tid: user.tenantId, role: user.role }), tenantId: user.tenantId, role: user.role };
  });

  app.get("/me", async (req) => {
    const session = await requireSession(req);
    const user = await deps.db.user.findUnique({
      where: { id: session.sub },
      select: { id: true, name: true, email: true, role: true, phoneE164: true, status: true, tenant: true },
    });
    if (!user || user.status !== "active") throw new DomainError("unauthorized", "Não autenticado", 401);
    return user;
  });
}
