import { SAAS } from "@/lib/api/saas-endpoints";
import { proxyJsonBody } from "@/lib/server/saas-proxy";

/** Proxy: `POST {SAAS_API_BASE_URL}/contacts` */
export async function POST(request: Request) {
  return proxyJsonBody(request, SAAS.contacts, "POST");
}
