"use client";

import { SidebarProvider } from "@/components/Layouts/sidebar/sidebar-context";
import { BrandingProvider } from "@/contexts/branding-context";
import type { PublicBranding } from "@/types/whitelabel";
import { ThemeProvider } from "next-themes";

export function Providers({
  children,
  branding,
}: {
  children: React.ReactNode;
  branding: PublicBranding;
}) {
  // Escuro por padrão, como o site da Jhota; o usuário ainda pode alternar.
  return (
    <ThemeProvider defaultTheme="dark" attribute="class">
      <BrandingProvider value={branding}>
        <SidebarProvider>{children}</SidebarProvider>
      </BrandingProvider>
    </ThemeProvider>
  );
}
