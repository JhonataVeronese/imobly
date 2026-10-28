import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import { CadastroListAlert } from "@/components/cadastros/cadastro-list-alert";
import { ListCard } from "@/components/cadastros/list-card";
import { PageIntro } from "@/components/cadastros/page-intro";
import { SAAS } from "@/lib/api/saas-endpoints";
import { fetchSaasList } from "@/lib/server/saas-list";
import type { ProviderAccount, WebhookEvent } from "@/types/configuracao";
import type { Metadata } from "next";
import { AccountsTableClient } from "./_components/accounts-table-client";
import { WebhookEventsTable } from "./_components/webhook-events-table";
import { OmniForm } from "./_components/omni-form";
import { ZapiForm } from "./_components/zapi-form";

export const metadata: Metadata = { title: "Integrações WhatsApp" };

export default async function IntegracoesPage() {
  const [accounts, events] = await Promise.all([
    fetchSaasList<ProviderAccount>(SAAS.providerAccounts, { requireTenantId: true }),
    fetchSaasList<WebhookEvent>(`${SAAS.webhookEvents}?limit=30`, { requireTenantId: true }),
  ]);

  return (
    <>
      <Breadcrumb pageName="Integrações WhatsApp" />
      <PageIntro description="Provedor usado para receber imóveis do corretor e enviar as campanhas. O envio sai em fila, no ritmo seguro de cada número." />
      <CadastroListAlert result={accounts} />
      <div className="space-y-6">
        <ListCard title="Integrações">
          <AccountsTableClient rows={accounts.data} />
        </ListCard>
        <OmniForm />
        <ZapiForm />
        <ListCard title="Últimos webhooks recebidos">
          <CadastroListAlert result={events} />
          <WebhookEventsTable rows={events.data} />
        </ListCard>
      </div>
    </>
  );
}
