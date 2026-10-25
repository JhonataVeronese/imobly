import { SAAS } from "@/lib/api/saas-endpoints";
import { proxySaasRequest } from "@/lib/server/saas-proxy";

/** Proxy: `GET {IMOBLY_API_URL}/simulator/conversation?after=N` */
export async function GET(request: Request) {
  const after = Number(new URL(request.url).searchParams.get("after") ?? 0) || 0;
  return proxySaasRequest(`${SAAS.simulator}/conversation?after=${after}`, { method: "GET", cache: "no-store" });
}
