import { SAAS } from "@/lib/api/saas-endpoints";
import { proxySaasRequest } from "@/lib/server/saas-proxy";

/** Proxy: `POST {SAAS_API_BASE_URL}/simulator/session` (cria o número e os contatos de teste). */
export async function POST() {
  return proxySaasRequest(`${SAAS.simulator}/session`, { method: "POST" });
}
