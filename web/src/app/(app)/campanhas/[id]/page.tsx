import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import { BackToListingLink } from "@/components/cadastros/back-to-listing";
import { CadastroListError, CadastroListUnconfigured } from "@/components/cadastros/cadastro-list-alert";
import { SAAS } from "@/lib/api/saas-endpoints";
import { fetchSaasResource } from "@/lib/server/saas-list";
import type { CampaignDetail } from "@/types/campanha";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CampanhaDetailClient } from "../_components/campanha-detail-client";

export const metadata: Metadata = { title: "Campanha" };

type Props = { params: Promise<{ id: string }> };

export default async function CampanhaPage({ params }: Props) {
  const { id } = await params;
  const result = await fetchSaasResource<CampaignDetail>(`${SAAS.campaigns}/${encodeURIComponent(id)}`);
  if (result.status === "not_found") notFound();

  return (
    <>
      <Breadcrumb pageName={result.data?.name ?? "Campanha"} parent={{ name: "Campanhas", href: "/campanhas" }} />
      <div className="mb-6">
        <BackToListingLink href="/campanhas" />
      </div>
      {result.status === "unconfigured" && <CadastroListUnconfigured />}
      {result.status === "error" && <CadastroListError message={result.message} />}
      {result.status === "ok" && <CampanhaDetailClient initial={result.data} />}
    </>
  );
}
