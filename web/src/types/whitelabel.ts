export interface Whitelabel {
  id: number;
  slug: string;
  nome: string;
  titulo: string;
  descricao: string | null;
  dominio: string | null;
  padrao: boolean;
  ativo: boolean;
  hasLogo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WhitelabelPublic {
  id: number;
  slug: string;
  nome: string;
  titulo: string;
  descricao: string | null;
  hasLogo: boolean;
  updatedAt?: string;
}

export interface PublicBranding {
  id: number | null;
  slug: string;
  nome: string;
  titulo: string;
  descricao: string | null;
  logoSrc: string;
}

export type WhitelabelPayload = {
  slug: string;
  nome: string;
  titulo: string;
  descricao?: string | null;
  dominio?: string | null;
  padrao: boolean;
  ativo: boolean;
  logoBase64?: string;
  logoMimeType?: string;
  removerLogo?: boolean;
};
