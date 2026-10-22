import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import { BackToListingLink } from "@/components/cadastros/back-to-listing";
import type { Metadata } from "next";
import { ContatoForm } from "../_components/contato-form";

export const metadata: Metadata = { title: "Novo contato" };

export default function NovoContatoPage() {
  return (
    <>
      <Breadcrumb pageName="Novo contato" parent={{ name: "Contatos", href: "/contatos" }} />
      <div className="mb-6">
        <BackToListingLink href="/contatos" />
      </div>
      <p className="mb-8 text-body-sm text-dark-4 dark:text-dark-6">
        Preferências vazias significam &quot;sem restrição&quot;: o contato entra no público de qualquer imóvel compatível.
      </p>
      <ContatoForm />
    </>
  );
}
