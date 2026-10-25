import { SAAS } from "@/lib/api/saas-endpoints";
import { proxyJsonBody } from "@/lib/server/saas-proxy";

/** Proxy: `POST {IMOBLY_API_URL}/contacts` */
export async function POST(request: Request) {
  return proxyJsonBody(request, SAAS.contacts, "POST");
}
