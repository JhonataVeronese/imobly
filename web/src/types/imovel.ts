export type PropertyStatus = "draft" | "active" | "archived";

export type PropertyAsset = {
  id: string;
  kind: "image" | "document";
  mimeType: string;
  sizeBytes: number;
  originalName: string | null;
  /** URL temporária (só no detalhe). */
  url?: string;
};

export type PropertyListItem = {
  id: string;
  title: string | null;
  description: string | null;
  propertyType: string | null;
  transaction: "venda" | "aluguel" | null;
  /** Decimal serializado pela API. */
  price: string | null;
  city: string | null;
  neighborhood: string | null;
  bedrooms: number | null;
  suites: number | null;
  bathrooms: number | null;
  parkingSpaces: number | null;
  areaM2: string | null;
  status: PropertyStatus;
  createdAt: string;
  assets: PropertyAsset[];
};

/** Corpo de `POST/PATCH /properties`. Campos nulos ficam sem valor — nunca inventamos dados. */
export type PropertyPayload = {
  title: string | null;
  description: string | null;
  propertyType: string | null;
  transaction: "venda" | "aluguel" | null;
  price: number | null;
  city: string | null;
  neighborhood: string | null;
  bedrooms: number | null;
  suites: number | null;
  bathrooms: number | null;
  parkingSpaces: number | null;
  areaM2: number | null;
};

export const PROPERTY_TYPES = [
  { value: "apartamento", label: "Apartamento" },
  { value: "casa", label: "Casa" },
  { value: "cobertura", label: "Cobertura" },
  { value: "studio", label: "Studio" },
  { value: "terreno", label: "Terreno" },
  { value: "sala_comercial", label: "Sala comercial" },
  { value: "galpao", label: "Galpão" },
  { value: "rural", label: "Rural" },
] as const;
