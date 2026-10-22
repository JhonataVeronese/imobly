import type { PublicBranding } from "@/types/whitelabel";

/** Ícone do app (manual da marca): símbolo amarelo sobre quadrado preto arredondado. */
export const DEFAULT_BRAND_LOGO = "/images/logo/imobly-icon.svg";

/** Marca fixa do imobly — a POC não tem white-label por domínio. */
export const DEFAULT_BRANDING: PublicBranding = {
  id: null,
  slug: "imobly",
  nome: "imobly",
  titulo: "by Jhota Software",
  descricao: "Seu próximo imóvel. Na conversa certa. Divulgação de imóveis pelo WhatsApp, em fila e com consentimento.",
  logoSrc: DEFAULT_BRAND_LOGO,
};
