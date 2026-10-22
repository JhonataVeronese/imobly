import { SAAS } from "@/lib/api/saas-endpoints";
import { proxyJsonBody, proxySaasRequest } from "@/lib/server/saas-proxy";

/** Proxy: `GET/POST {SAAS_API_BASE_URL}/campaigns` */
export async function GET() {
  return proxySaasRequest(SAAS.campaigns, { method: "GET", cache: "no-store" });
}

export async function POST(request: Request) {
  return proxyJsonBody(request, SAAS.campaigns, "POST");
}
