"use client";

import { DEFAULT_BRANDING } from "@/lib/brand";
import type { PublicBranding } from "@/types/whitelabel";
import { createContext, useContext } from "react";

const BrandingContext = createContext<PublicBranding>(DEFAULT_BRANDING);

export function BrandingProvider({
  value,
  children,
}: {
  value: PublicBranding;
  children: React.ReactNode;
}) {
  return (
    <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
  );
}

export function useBranding(): PublicBranding {
  return useContext(BrandingContext);
}
