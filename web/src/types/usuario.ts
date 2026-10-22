export type UsuarioPerfil = "admin" | "operador" | "leitura";

export const PERFIL_LABEL: Record<UsuarioPerfil, string> = {
  admin: "Administrador",
  operador: "Operador",
  leitura: "Somente leitura",
};

/** Item retornado em listagens (API ou mock). */
export type UsuarioListItem = {
  id: string;
  tenantId?: string;
  tenantNome?: string;
  nome: string;
  email: string;
  perfil: UsuarioPerfil;
  ativo: boolean;
  cadastradoEm: string;
};

/** Corpo sugerido para `POST /usuarios` (senha não deve voltar em GET). */
export type UsuarioCreatePayload = {
  tenantId: string;
  nome: string;
  email: string;
  senha: string;
  perfil: UsuarioPerfil;
};
