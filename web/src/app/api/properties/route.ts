import { SAAS } from "@/lib/api/saas-endpoints";
import { proxyJsonBody } from "@/lib/server/saas-proxy";

/** Proxy: `POST {SAAS_API_BASE_URL}/properties` — entrada de imóvel pelo painel. */
export async function POST(request: Request) {
  return proxyJsonBody(request, SAAS.properties, "POST");
}
