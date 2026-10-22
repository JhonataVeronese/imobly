/**
 * Contatos, consentimento e descadastro — telas `/contatos/*`.
 * Backend: `{SAAS_API_BASE_URL}/contacts` via BFF `/api/contacts`.
 */
import { bffRequest, jsonInit } from "@/lib/api/bff-request";
import { NEXT_PROXY } from "@/lib/api/saas-endpoints";
import type { ConsentPayload, ContactCreatePayload, ContactListItem, ImportReport } from "@/types/contato";

const contactUrl = (id: string) => `${NEXT_PROXY.contacts}/${encodeURIComponent(id)}`;

export function createContact(payload: ContactCreatePayload): Promise<ContactListItem> {
  return bffRequest<ContactListItem>(NEXT_PROXY.contacts, jsonInit("POST", payload));
}

/** A importação não registra consentimento sem origem + evidência por linha. */
export function importContactsCsv(fileName: string, csv: string): Promise<ImportReport> {
  return bffRequest<ImportReport>(`${NEXT_PROXY.contactsImport}?fileName=${encodeURIComponent(fileName)}`, {
    method: "POST",
    headers: { "Content-Type": "text/csv" },
    body: csv,
  });
}

export function registerConsent(id: string, payload: ConsentPayload): Promise<unknown> {
  return bffRequest(`${contactUrl(id)}/consent`, jsonInit("POST", payload));
}

export function optOutContact(id: string): Promise<unknown> {
  return bffRequest(`${contactUrl(id)}/opt-out`, jsonInit("POST", { reason: "manual" }));
}
