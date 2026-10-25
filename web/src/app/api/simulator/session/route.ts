import { SAAS } from "@/lib/api/saas-endpoints";
import { proxySaasRequest } from "@/lib/server/saas-proxy";

/** Proxy: `POST {IMOBLY_API_URL}/simulator/session` (cria o número e os contatos de teste). */
export async function POST() {
  return proxySaasRequest(`${SAAS.simulator}/session`, { method: "POST" });
}
