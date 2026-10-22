import type { UsuarioPerfil } from "@/types/usuario";

/** Resposta de `GET /api/auth/me` (cookie de sessão). */
export type AuthMe = {
  email: string;
  name: string | null;
  sub: string | null;
  isSuper: boolean;
  /** Perfil no parceiro (admin / operador / leitura); super global usa `isSuper`. */
  perfil: UsuarioPerfil | null;
  tenantHomeId: string | null;
  /** Parceiro em uso nas rotas com `X-Tenant-Id` (BFF / API). */
  activeTenantId: string | null;
  /** Nome da organização (imobiliária) da sessão. */
  tenantName: string | null;
  /** Códigos de módulo da assinatura atual (`GET /assinatura/atual`). */
  moduloCodigos: string[];
};
