import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import { CadastroListAlert } from "@/components/cadastros/cadastro-list-alert";
import { ListCard } from "@/components/cadastros/list-card";
import { PageIntro } from "@/components/cadastros/page-intro";
import { SAAS } from "@/lib/api/saas-endpoints";
import { fetchSaasList } from "@/lib/server/saas-list";
import type { CampaignListItem } from "@/types/campanha";
import type { Metadata } from "next";
import { CampanhasTableClient } from "./_components/campanhas-table-client";

export const metadata: Metadata = {
  title: "Campanhas",
  description: "Campanhas de divulgação de imóveis",
};

export default async function CampanhasPage() {
  const result = await fetchSaasList<CampaignListItem>(SAAS.campaigns, { requireTenantId: true });

  return (
    <>
      <Breadcrumb pageName="Campanhas" />
      <PageIntro
        description="Campanhas criadas pelo WhatsApp ou pelo painel. Nenhum envio começa sem confirmação explícita."
        action={{ href: "/imoveis", label: "Criar a partir de um imóvel" }}
      />
      <CadastroListAlert result={result} />
      <ListCard>
        <CampanhasTableClient rows={result.data} />
      </ListCard>
    </>
  );
}
