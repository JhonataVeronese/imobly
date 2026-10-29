import type { PublicBranding } from "@/types/whitelabel";

/** Ícone do app (manual da marca): casa + chat amarelo sobre quadrado preto arredondado. */
export const DEFAULT_BRAND_LOGO = "/images/logo/auren-icon-color.svg";

/** Marca fixa do Auren Sistemas. */
export const DEFAULT_BRANDING: PublicBranding = {
  id: null,
  slug: "auren",
  nome: "Auren",
  titulo: "Sistemas Inteligentes",
  descricao: "Sistemas inteligentes. Conversas que convertem. Automatize o atendimento e impulsione suas vendas com tecnologia inteligente para o mercado imobiliário.",
  logoSrc: DEFAULT_BRAND_LOGO,
};
