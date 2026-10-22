import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import { BackToListingLink } from "@/components/cadastros/back-to-listing";
import { CadastroListError, CadastroListUnconfigured } from "@/components/cadastros/cadastro-list-alert";
import { SAAS } from "@/lib/api/saas-endpoints";
import { fetchSaasResource } from "@/lib/server/saas-list";
import type { PropertyListItem } from "@/types/imovel";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CreateCampaignButton } from "../../_components/create-campaign-button";
import { ImovelAssets } from "../../_components/imovel-assets";
import { ImovelForm } from "../../_components/imovel-form";

export const metadata: Metadata = { title: "Corrigir imóvel" };

type Props = { params: Promise<{ id: string }> };

export default async function EditarImovelPage({ params }: Props) {
  const { id } = await params;
  const result = await fetchSaasResource<PropertyListItem>(`${SAAS.properties}/${encodeURIComponent(id)}`);
  if (result.status === "not_found") notFound();

  return (
    <>
      <Breadcrumb pageName={result.data?.title ?? "Imóvel"} parent={{ name: "Imóveis", href: "/imoveis" }} />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <BackToListingLink href="/imoveis" />
        {result.status === "ok" && result.data.status !== "archived" && <CreateCampaignButton propertyId={id} />}
      </div>

      {result.status === "unconfigured" && <CadastroListUnconfigured />}
      {result.status === "error" && <CadastroListError message={result.message} />}
      {result.status === "ok" && (
        <div className="space-y-6">
          <ImovelForm property={result.data} />
          <ImovelAssets propertyId={id} assets={result.data.assets} />
        </div>
      )}
    </>
  );
}
