"use client";

import { useBranding } from "@/contexts/branding-context";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";

type LogoProps = {
  compact?: boolean;
  /** Fundo sempre escuro (ex.: hero): "imo" fica branco nos dois temas. */
  onDark?: boolean;
  size?: "md" | "lg";
  className?: string;
};

/**
 * Logotipo do imobly (manual da marca): símbolo amarelo + "imo" (preto/branco) e "bly" em amarelo,
 * com "by Jhota Software" abaixo. Montserrat ExtraBold.
 */
export function Logo({ compact = false, onDark = false, size = "md", className }: LogoProps) {
  const branding = useBranding();
  const lg = size === "lg";
  const mark = compact ? "size-9" : lg ? "size-16" : "size-12";

  return (
    <span className={cn("flex w-full min-w-0 items-center justify-start gap-2.5", className)} aria-label={branding.nome}>
      <BrandMark className={cn("shrink-0", mark)} />
      <span className="min-w-0">
        <span
          aria-hidden
          className={cn(
            "block font-display font-extrabold leading-none tracking-tight",
            compact ? "text-2xl" : lg ? "text-5xl" : "text-[34px]",
            onDark ? "text-white" : "text-dark dark:text-white",
          )}
        >
          imo<span className="text-neon">bly</span>
        </span>
        {!compact && (
          <span
            className={cn(
              "mt-1 block font-medium",
              lg ? "text-base" : "text-xs",
              onDark ? "text-white/70" : "text-dark-5 dark:text-white/70",
            )}
          >
            {branding.titulo}
          </span>
        )}
      </span>
    </span>
  );
}
