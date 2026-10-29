"use client";

import { useBranding } from "@/contexts/branding-context";
import { cn } from "@/lib/utils";

type LogoProps = {
  compact?: boolean;
  /** Fundo sempre escuro (ex.: hero): "imo" fica branco nos dois temas. */
  onDark?: boolean;
  size?: "md" | "lg";
  className?: string;
};

/**
 * Logotipo do Auren: horizontal com ícone (casa + chat) e wordmark "Auren"
 */
export function Logo({ compact = false, onDark = false, size = "md", className }: LogoProps) {
  const branding = useBranding();
  const lg = size === "lg";

  const logoSrc = onDark ? "/images/logo/auren-horizontal-white.svg" : "/images/logo/auren-horizontal-color.svg";
  const logoHeight = compact ? "h-8" : lg ? "h-20" : "h-12";

  return (
    <div className={cn("flex w-full min-w-0 items-center", className)} aria-label={branding.nome}>
      <img
        src={logoSrc}
        alt={branding.nome}
        className={cn("shrink-0 w-auto", logoHeight)}
      />
    </div>
  );
}
