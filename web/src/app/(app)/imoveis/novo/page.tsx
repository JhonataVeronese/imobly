import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import { BackToListingLink } from "@/components/cadastros/back-to-listing";
import type { Metadata } from "next";
import { ImovelForm } from "../_components/imovel-form";

export const metadata: Metadata = { title: "Novo imóvel" };

export default function NovoImovelPage() {
  return (
    <>
      <Breadcrumb pageName="Novo imóvel" parent={{ name: "Imóveis", href: "/imoveis" }} />
      <div className="mb-6">
        <BackToListingLink href="/imoveis" />
      </div>
      <p className="mb-8 text-body-sm text-dark-4 dark:text-dark-6">
        Entrada alternativa ao WhatsApp. Depois de cadastrar, adicione fotos e PDF e crie a campanha.
      </p>
      <ImovelForm />
    </>
  );
}
