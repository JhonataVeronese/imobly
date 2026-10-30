import type { NavSection } from "../types";
import * as Icons from "../icons";

export const NAV_DATA: NavSection[] = [
  {
    label: "Administração",
    access: "super",
    items: [
      {
        title: "Clientes",
        icon: Icons.FourCircle,
        url: "/admin/clientes",
        items: [],
      },
      {
        title: "Manual do WhatsApp",
        icon: Icons.BookOpen,
        url: "/manual",
        items: [],
      },
    ],
  },
  {
    label: "Menu principal",
    items: [
      {
        title: "Painel",
        icon: Icons.PieChart,
        url: "/painel",
        tenantScopeOnly: true,
        items: [],
      },
      {
        title: "Campanhas",
        icon: Icons.ChatBubble,
        url: "/campanhas",
        tenantScopeOnly: true,
        items: [],
      },
      {
        title: "Imóveis",
        icon: Icons.HomeIcon,
        tenantScopeOnly: true,
        items: [
          { title: "Imóveis cadastrados", url: "/imoveis" },
          { title: "Novo imóvel", url: "/imoveis/novo" },
        ],
      },
      {
        title: "Contatos",
        icon: Icons.User,
        tenantScopeOnly: true,
        items: [
          { title: "Carteira de contatos", url: "/contatos" },
          { title: "Novo contato", url: "/contatos/novo" },
          { title: "Importar CSV", url: "/contatos/importar" },
          { title: "Descadastros", url: "/contatos/descadastros" },
        ],
      },
      {
        title: "Simulador WhatsApp",
        icon: Icons.ChatBubble,
        url: "/simulador",
        tenantScopeOnly: true,
        items: [],
      },
      {
        title: "Manual do WhatsApp",
        icon: Icons.BookOpen,
        url: "/manual",
        tenantScopeOnly: true,
        items: [],
      },
    ],
  },
];
