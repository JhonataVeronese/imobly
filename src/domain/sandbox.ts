/**
 * Sandbox do simulador do painel. Isolamento nos dois sentidos:
 *  - campanhas do número do simulador só alcançam contatos de teste;
 *  - campanhas de números reais nunca alcançam contatos de teste.
 */
export const SIMULATOR_PROVIDER = "simulator";
export const SANDBOX_CONTACT_SOURCE = "simulador";

export function isSandboxProvider(provider: string | null | undefined): boolean {
  return provider === SIMULATOR_PROVIDER;
}

/** Filtro Prisma do lado certo do isolamento. `source` nulo conta como contato real. */
export function sandboxContactFilter(sandbox: boolean) {
  return sandbox
    ? { source: SANDBOX_CONTACT_SOURCE }
    : { OR: [{ source: null }, { source: { not: SANDBOX_CONTACT_SOURCE } }] };
}
