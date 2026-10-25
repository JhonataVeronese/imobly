import { NextResponse } from "next/server";

import { SAAS } from "@/lib/api/saas-endpoints";
import { proxyJsonBody, proxySaasRequest } from "@/lib/server/saas-proxy";

/** Proxy: `POST {IMOBLY_API_URL}/simulator/agent` — JSON `{ text }` ou multipart (`text` + um `file`). */
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
    return proxyJsonBody(request, `${SAAS.simulator}/agent`, "POST");
  }
  let incoming: FormData;
  try {
    incoming = await request.formData();
  } catch {
    return NextResponse.json({ error: "Envio de arquivo inválido" }, { status: 400 });
  }
  const file = incoming.get("file");
  const outgoing = new FormData();
  outgoing.append("text", String(incoming.get("text") ?? ""));
  if (file instanceof File) outgoing.append("file", file, file.name);
  return proxySaasRequest(`${SAAS.simulator}/agent`, { method: "POST", body: outgoing, signal: AbortSignal.timeout(60_000) });
}
