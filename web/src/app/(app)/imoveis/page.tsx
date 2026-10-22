import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import { CadastroListAlert } from "@/components/cadastros/cadastro-list-alert";
import { ListCard } from "@/components/cadastros/list-card";
import { PageIntro } from "@/components/cadastros/page-intro";
import { SAAS } from "@/lib/api/saas-endpoints";
import { fetchSaasList } from "@/lib/server/saas-list";
import type { PropertyListItem } from "@/types/imovel";
import type { Metadata } from "next";
import { ImoveisTableClient } from "./_components/imoveis-table-client";

export const metadata: Metadata = {
  title: "Imóveis",
  description: "Imóveis recebidos pelo WhatsApp ou cadastrados no painel",
};

export default async function ImoveisPage() {
  const result = await fetchSaasList<PropertyListItem>(SAAS.properties, { requireTenantId: true });

  return (
    <>
      <Breadcrumb pageName="Imóveis" />
      <PageIntro
        description="Imóveis recebidos pelo WhatsApp aparecem aqui como rascunho. Campos não informados ficam em branco — corrija antes de confirmar a campanha."
        action={{ href: "/imoveis/novo", label: "Novo imóvel" }}
      />
      <CadastroListAlert result={result} />
      <ListCard>
        <ImoveisTableClient rows={result.data} />
      </ListCard>
    </>
  );
}
