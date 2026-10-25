import { SAAS } from "@/lib/api/saas-endpoints";
import { proxyJsonBody } from "@/lib/server/saas-proxy";

/** Proxy: `POST {IMOBLY_API_URL}/provider-accounts` — credenciais seguem direto para o cofre da API. */
export async function POST(request: Request) {
  return proxyJsonBody(request, SAAS.providerAccounts, "POST");
}
