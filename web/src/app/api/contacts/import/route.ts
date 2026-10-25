import { NextResponse } from "next/server";

import { SAAS } from "@/lib/api/saas-endpoints";
import { forwardQuery, proxySaasRequest } from "@/lib/server/saas-proxy";

const MAX_CSV_BYTES = 10 * 1024 * 1024;

/** Proxy: `POST {IMOBLY_API_URL}/contacts/import?fileName=` com corpo `text/csv`. */
export async function POST(request: Request) {
  const csv = await request.text();
  if (!csv.trim()) return NextResponse.json({ error: "Arquivo CSV vazio" }, { status: 400 });
  if (Buffer.byteLength(csv) > MAX_CSV_BYTES) {
    return NextResponse.json({ error: "CSV acima de 10 MB" }, { status: 413 });
  }
  return proxySaasRequest(`${SAAS.contactsImport}${forwardQuery(request, ["fileName"])}`, {
    method: "POST",
    headers: { "Content-Type": "text/csv" },
    body: csv,
    signal: AbortSignal.timeout(60_000),
  });
}
