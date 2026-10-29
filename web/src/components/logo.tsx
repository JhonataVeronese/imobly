"use client";

import { useBranding } from "@/contexts/branding-context";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";

type LogoProps = {
  compact?: boolean;
  /** Fundo sempre escuro (ex.: hero): "Au" fica branco nos dois temas. */
  onDark?: boolean;
  size?: "md" | "lg";
  className?: string;
};

/** Logotipo horizontal da Auren: símbolo + "Au" (preto/branco) "ren" (amarelo) + "Sistemas". */
export function Logo({ compact = false, onDark = false, size = "md", className }: LogoProps) {
  const branding = useBranding();
  const lg = size === "lg";

  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)} aria-label={branding.nome}>
      <BrandMark className={cn("shrink-0", compact ? "size-8" : lg ? "size-14" : "size-10")} />
      <span className="flex min-w-0 flex-col leading-none">
        <span
          className={cn(
            "font-display font-extrabold tracking-tight",
            compact ? "text-xl" : lg ? "text-4xl" : "text-[26px]",
            onDark ? "text-white" : "text-dark dark:text-white",
          )}
        >
          Au<span className="text-neon">ren</span>
        </span>
        {!compact && (
          <span className={cn("mt-0.5 font-medium text-dark-5", lg ? "text-base" : "text-xs", onDark ? "text-white/60" : "dark:text-dark-6")}>
            Sistemas
          </span>
        )}
      </span>
    </div>
  );
}
