import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import { BackToListingLink } from "@/components/cadastros/back-to-listing";
import type { Metadata } from "next";
import { ImportarClient } from "../_components/importar-client";

export const metadata: Metadata = { title: "Importar contatos" };

export default function ImportarContatosPage() {
  return (
    <>
      <Breadcrumb pageName="Importar contatos" parent={{ name: "Contatos", href: "/contatos" }} />
      <div className="mb-6">
        <BackToListingLink href="/contatos" />
      </div>
      <ImportarClient />
    </>
  );
}
