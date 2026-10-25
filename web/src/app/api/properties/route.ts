import { SAAS } from "@/lib/api/saas-endpoints";
import { proxyJsonBody } from "@/lib/server/saas-proxy";

/** Proxy: `POST {IMOBLY_API_URL}/properties` — entrada de imóvel pelo painel. */
export async function POST(request: Request) {
  return proxyJsonBody(request, SAAS.properties, "POST");
}
