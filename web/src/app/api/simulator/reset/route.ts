import { SAAS } from "@/lib/api/saas-endpoints";
import { proxySaasRequest } from "@/lib/server/saas-proxy";

/** Proxy: `POST {SAAS_API_BASE_URL}/simulator/reset` (apaga a simulação). */
export async function POST() {
  return proxySaasRequest(`${SAAS.simulator}/reset`, { method: "POST" });
}
