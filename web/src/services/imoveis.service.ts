/**
 * Imóveis — telas `/imoveis`, `/imoveis/novo`, `/imoveis/[id]/editar`.
 * Backend: `{SAAS_API_BASE_URL}/properties` via BFF `/api/properties`.
 */
import { bffRequest, jsonInit } from "@/lib/api/bff-request";
import { NEXT_PROXY } from "@/lib/api/saas-endpoints";
import type { PropertyAsset, PropertyListItem, PropertyPayload } from "@/types/imovel";

const propertyUrl = (id: string) => `${NEXT_PROXY.properties}/${encodeURIComponent(id)}`;

export function createProperty(payload: PropertyPayload): Promise<PropertyListItem> {
  return bffRequest<PropertyListItem>(NEXT_PROXY.properties, jsonInit("POST", payload));
}

/** Correção dos dados — a API recalcula o público estimado das campanhas pendentes. */
export function updateProperty(id: string, payload: PropertyPayload): Promise<PropertyListItem> {
  return bffRequest<PropertyListItem>(propertyUrl(id), jsonInit("PATCH", payload));
}

export function uploadPropertyAssets(id: string, files: File[]): Promise<PropertyAsset[]> {
  const form = new FormData();
  for (const file of files) form.append("file", file, file.name);
  return bffRequest<PropertyAsset[]>(`${propertyUrl(id)}/assets`, { method: "POST", body: form });
}

export async function deletePropertyAsset(id: string, assetId: string): Promise<void> {
  await bffRequest<null>(`${propertyUrl(id)}/assets/${encodeURIComponent(assetId)}`, { method: "DELETE" });
}
