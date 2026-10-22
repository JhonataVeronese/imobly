import "@/css/style.css";

import { DEFAULT_BRANDING } from "@/lib/brand";
import type { Metadata } from "next";
import NextTopLoader from "nextjs-toploader";
import type { PropsWithChildren } from "react";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    template: `%s | ${DEFAULT_BRANDING.nome}`,
    default: `${DEFAULT_BRANDING.nome} — Seu próximo imóvel. Na conversa certa.`,
  },
  description: DEFAULT_BRANDING.descricao ?? DEFAULT_BRANDING.titulo,
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Tipografia da marca imobly: Montserrat. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers branding={DEFAULT_BRANDING}>
          <NextTopLoader color="#FFD600" showSpinner={false} />
          {children}
        </Providers>
      </body>
    </html>
  );
}
