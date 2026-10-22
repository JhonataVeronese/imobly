import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { FastifyReply, FastifyRequest } from "fastify";
import { DomainError } from "../domain/errors.js";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, saltB64, hashB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(expected, actual);
}

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: "owner" | "admin" | "agent";
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; tid: string; role: AuthContext["role"] };
    user: { sub: string; tid: string; role: AuthContext["role"] };
  }
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext;
  }
}

/** preHandler: autentica e fixa o tenant da requisição. O tenant NUNCA vem do corpo/URL. */
export async function requireAuth(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  try {
    const p = await req.jwtVerify<{ sub: string; tid: string; role: AuthContext["role"] }>();
    req.auth = { userId: p.sub, tenantId: p.tid, role: p.role };
  } catch {
    throw new DomainError("unauthorized", "Não autenticado", 401);
  }
}

export function requireRole(...roles: AuthContext["role"][]) {
  return async (req: FastifyRequest) => {
    if (!roles.includes(req.auth.role)) throw new DomainError("forbidden", "Permissão insuficiente", 403);
  };
}
