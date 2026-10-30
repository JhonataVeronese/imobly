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

export type UserRole = "platform_admin" | "agent";

/** Corretor autenticado: o tenant vem do token, nunca do corpo/URL. */
export interface AuthContext {
  userId: string;
  tenantId: string;
  role: "agent";
}

export interface PlatformAuthContext {
  userId: string;
}

type TokenPayload = { sub: string; tid: string | null; role: UserRole };

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: TokenPayload;
    user: TokenPayload;
  }
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext;
    platformAuth: PlatformAuthContext;
  }
}

async function verifyToken(req: FastifyRequest): Promise<TokenPayload> {
  try {
    return await req.jwtVerify<TokenPayload>();
  } catch {
    throw new DomainError("unauthorized", "Não autenticado", 401);
  }
}

/** preHandler das rotas do cliente (corretor). O administrador da plataforma não opera dados de tenant. */
export async function requireAuth(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const p = await verifyToken(req);
  if (p.role !== "agent" || !p.tid) throw new DomainError("forbidden", "Área exclusiva das imobiliárias", 403);
  req.auth = { userId: p.sub, tenantId: p.tid, role: "agent" };
}

/** preHandler das rotas `/admin/*`: só o administrador da plataforma. */
export async function requirePlatformAdmin(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const p = await verifyToken(req);
  if (p.role !== "platform_admin") throw new DomainError("forbidden", "Área exclusiva do administrador da plataforma", 403);
  req.platformAuth = { userId: p.sub };
}

/** Qualquer usuário autenticado (ex.: GET /me). Chamado dentro do handler, não como preHandler. */
export async function requireSession(req: FastifyRequest): Promise<TokenPayload> {
  return verifyToken(req);
}
