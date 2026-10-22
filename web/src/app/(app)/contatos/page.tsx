import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import { CadastroListError, CadastroListUnconfigured } from "@/components/cadastros/cadastro-list-alert";
import { ListCard } from "@/components/cadastros/list-card";
import { PageIntro } from "@/components/cadastros/page-intro";
import { SAAS } from "@/lib/api/saas-endpoints";
import { fetchSaasResource } from "@/lib/server/saas-list";
import type { ContactsPage } from "@/types/contato";
import type { Metadata } from "next";
import { ContatosFilters } from "./_components/contatos-filters";
import { ContatosTableClient } from "./_components/contatos-table-client";

export const metadata: Metadata = { title: "Contatos", description: "Carteira de contatos e consentimentos" };

const PAGE_SIZE = 50;
const STATUSES = new Set(["active", "opted_out", "blocked"]);

type Props = { searchParams: Promise<{ q?: string; status?: string; page?: string }> };

export default async function ContatosPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const status = sp.status && STATUSES.has(sp.status) ? sp.status : "";
  const page = Math.max(1, Number(sp.page) || 1);

  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (q) query.set("q", q);
  if (status) query.set("status", status);
  const result = await fetchSaasResource<ContactsPage>(`${SAAS.contacts}?${query.toString()}`);
  const total = result.status === "ok" ? result.data.total : 0;

  return (
    <>
      <Breadcrumb pageName="Contatos" />
      <PageIntro
        description="Só recebem campanhas contatos ativos, com consentimento registrado e fora da lista de descadastro."
        action={{ href: "/contatos/importar", label: "Importar CSV" }}
      />
      {result.status === "unconfigured" && <CadastroListUnconfigured />}
      {result.status === "error" && <CadastroListError message={result.message} />}
      <ListCard
        title={`Carteira (${total})`}
        actions={<ContatosFilters q={q} status={status} page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} />}
      >
        <ContatosTableClient rows={result.status === "ok" ? result.data.items : []} />
      </ListCard>
    </>
  );
}
