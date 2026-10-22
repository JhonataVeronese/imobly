import { SignJWT, jwtVerify } from "jose";

import { appConfig } from "@/config/app-config";
import type { UsuarioPerfil } from "@/types/usuario";

import { SESSION_COOKIE } from "./constants";

const getSecret = () => {
  return new TextEncoder().encode(appConfig.jwtSecret);
};

/** Sessão assinada no BFF (cookie httpOnly). Inclui o JWT de acesso da API principal. */
export type SessionPayload = {
  sub: string;
  email: string;
  name: string;
  /** Bearer enviado à API principal */
  accessToken: string;
  /** Tenant “home” (JWT / cadastro). */
  tenantHomeId?: string | null;
  /** Tenant ativo para `X-Tenant-Id` (super pode operar outro tenant). */
  activeTenantId?: string | null;
  isSuper?: boolean;
  /** Perfil no tenant (persistido no cookie como o tenant). */
  perfil?: UsuarioPerfil | null;
};

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    email: payload.email,
    name: payload.name,
    accessToken: payload.accessToken,
    tenantHomeId: payload.tenantHomeId ?? null,
    activeTenantId: payload.activeTenantId ?? null,
    isSuper: payload.isSuper ?? false,
    perfil: payload.perfil ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const sub = payload.sub;
    const email = payload.email as string | undefined;
    const name = payload.name as string | undefined;
    const accessToken = payload.accessToken as string | undefined;
    if (!sub || !email || !name || !accessToken) return null;
    return {
      sub,
      email,
      name,
      accessToken,
      tenantHomeId: (payload.tenantHomeId as string | null | undefined) ?? null,
      activeTenantId:
        (payload.activeTenantId as string | null | undefined) ?? null,
      isSuper: Boolean(payload.isSuper),
      perfil: parsePerfilClaim(payload.perfil),
    };
  } catch {
    return null;
  }
}

function parsePerfilClaim(v: unknown): UsuarioPerfil | null {
  if (typeof v !== "string") return null;
  const p = v.toLowerCase();
  if (p === "admin" || p === "operador" || p === "leitura") return p;
  return null;
}

export { SESSION_COOKIE };
