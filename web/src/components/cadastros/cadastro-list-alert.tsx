import type { SaasListResult } from "@/lib/server/saas-list";

/** Aviso quando a API não está configurada (lista vazia). */
export function CadastroListUnconfigured() {
  return (
    <p className="mb-4 rounded-lg border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber dark:bg-amber/15">
      API principal não configurada. Defina{" "}
      <code className="rounded bg-gray-2 px-1 dark:bg-dark-2">
        IMOBLY_API_URL
      </code>{" "}
      no ambiente (ex.: arquivo{" "}
      <code className="rounded bg-gray-2 px-1 dark:bg-dark-2">.env.local</code>
      ).       Para listar com escopo do parceiro, defina{" "}
      <code className="rounded bg-gray-2 px-1 dark:bg-dark-2">
        IMOBLY_API_TENANT_ID
      </code>
      . Para admin global sem header de parceiro, use{" "}
      <code className="rounded bg-gray-2 px-1 dark:bg-dark-2">
        IMOBLY_SKIP_TENANT_HEADER=true
      </code>
      .
    </p>
  );
}

export function CadastroListError({
  message,
}: {
  message: string;
}) {
  return (
    <p
      className="mb-4 rounded-lg border border-red/30 bg-red/10 px-4 py-3 text-sm text-red dark:bg-red/15"
      role="alert"
    >
      {message}
    </p>
  );
}

/** Renderiza alerta conforme resultado da listagem (fora de `ok`). */
export function CadastroListAlert<T>({
  result,
}: {
  result: SaasListResult<T>;
}) {
  if (result.status === "unconfigured") {
    return <CadastroListUnconfigured />;
  }
  if (result.status === "error") {
    return <CadastroListError message={result.message} />;
  }
  return null;
}
