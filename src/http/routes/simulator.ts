import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../../application/deps.js";
import { conversation, ensureSandbox, resetSandbox, sendAsAgent, sendAsContact, type SimulatorUpload } from "../../application/simulator-service.js";
import { DomainError } from "../../domain/errors.js";
import { requireAuth } from "../auth.js";

/** Simulador de WhatsApp do painel. Tudo restrito ao tenant do token e ao número sandbox. */
export function registerSimulatorRoutes(app: FastifyInstance, deps: AppDeps) {
  const auth = { preHandler: requireAuth };

  app.post("/simulator/session", auth, async (req) => {
    await ensureSandbox(deps, req.auth.tenantId, req.auth.userId);
    return conversation(deps, req.auth.tenantId, req.auth.userId, 0);
  });

  app.get<{ Querystring: { after?: string } }>("/simulator/conversation", auth, async (req) =>
    conversation(deps, req.auth.tenantId, req.auth.userId, Number(req.query.after ?? 0) || 0),
  );

  /** JSON `{ text }` ou multipart com `text` + um `file` (foto ou PDF). */
  app.post("/simulator/agent", auth, async (req, reply) => {
    let text: string | null = null;
    let file: SimulatorUpload | null = null;
    if (req.isMultipart()) {
      for await (const part of req.parts()) {
        if (part.type === "file") {
          if (file) throw new DomainError("too_many_files", "Envie um arquivo por mensagem, como no WhatsApp");
          const buffer = await part.toBuffer();
          if (part.file.truncated) throw new DomainError("file_too_large", "Arquivo acima do limite");
          file = { buffer, fileName: part.filename || "arquivo", mimeType: part.mimetype };
        } else if (part.fieldname === "text") {
          text = String(part.value ?? "");
        }
      }
    } else {
      text = z.object({ text: z.string().max(4000) }).parse(req.body).text;
    }
    return reply.status(202).send(await sendAsAgent(deps, req.auth.tenantId, req.auth.userId, text, file));
  });

  app.post<{ Params: { id: string } }>("/simulator/contacts/:id/messages", auth, async (req, reply) => {
    const { text } = z.object({ text: z.string().min(1).max(1000) }).parse(req.body);
    return reply.status(202).send(await sendAsContact(deps, req.auth.tenantId, req.auth.userId, req.params.id, text));
  });

  app.post("/simulator/reset", auth, async (req) => resetSandbox(deps, req.auth.tenantId));
}
