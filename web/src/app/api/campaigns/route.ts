import { SAAS } from "@/lib/api/saas-endpoints";
import { proxyJsonBody, proxySaasRequest } from "@/lib/server/saas-proxy";

/** Proxy: `GET/POST {IMOBLY_API_URL}/campaigns` */
export async function GET() {
  return proxySaasRequest(SAAS.campaigns, { method: "GET", cache: "no-store" });
}

export async function POST(request: Request) {
  return proxyJsonBody(request, SAAS.campaigns, "POST");
}
