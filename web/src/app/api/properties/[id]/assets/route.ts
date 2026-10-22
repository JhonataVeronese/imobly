import { NextResponse } from "next/server";

import { SAAS } from "@/lib/api/saas-endpoints";
import { proxySaasRequest, uuidParamOr400 } from "@/lib/server/saas-proxy";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_FILES = 10;

/**
 * Proxy multipart: `POST {SAAS_API_BASE_URL}/properties/:id/assets`.
 * Tipo real e tamanho são validados pela API (magic bytes); aqui só limitamos a quantidade.
 */
export async function POST(request: Request, context: RouteContext) {
  const id = uuidParamOr400((await context.params).id);
  if (id instanceof NextResponse) return id;

  let incoming: FormData;
  try {
    incoming = await request.formData();
  } catch {
    return NextResponse.json({ error: "Envio de arquivos inválido" }, { status: 400 });
  }
  const files = incoming.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Envie no máximo ${MAX_FILES} arquivos por vez` }, { status: 400 });
  }

  const outgoing = new FormData();
  for (const file of files) outgoing.append("file", file, file.name);
  return proxySaasRequest(`${SAAS.properties}/${id}/assets`, {
    method: "POST",
    body: outgoing,
    signal: AbortSignal.timeout(60_000),
  });
}
