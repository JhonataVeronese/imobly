import type { SVGProps } from "react";

export type NavAccessLevel = "all" | "admin" | "super";

type IconProps = { className?: string } & SVGProps<SVGSVGElement>;

export type NavSubItem = {
  title: string;
  url: string;
  /** `all`: qualquer logado; `admin`: admin do parceiro ou super; `super`: só super global. */
  access?: NavAccessLevel;
  /** Itens operacionais do parceiro: ocultos para usuário super global. */
  tenantScopeOnly?: boolean;
  /** Exige um dos códigos de módulo da assinatura (ignorado para SUPER). */
  moduleCodes?: string[];
};

export type NavItem = {
  title: string;
  icon: React.ComponentType<IconProps>;
  items: NavSubItem[];
  url?: string;
  /** `all`: qualquer logado; `admin`: admin do parceiro ou super; `super`: só super global. */
  access?: NavAccessLevel;
  /** Itens operacionais do parceiro: ocultos para usuário super global. */
  tenantScopeOnly?: boolean;
  /** Só aparece para super global (ex.: área `/super`). */
  superOnly?: boolean;
  /** Exige um dos códigos de módulo da assinatura (ignorado para SUPER). */
  moduleCodes?: string[];
};

export type NavSection = {
  label: string;
  access?: NavAccessLevel;
  items: NavItem[];
};
