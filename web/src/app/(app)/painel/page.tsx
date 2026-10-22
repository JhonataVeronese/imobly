import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import { CadastroListError, CadastroListUnconfigured } from "@/components/cadastros/cadastro-list-alert";
import { ListCard } from "@/components/cadastros/list-card";
import * as Icons from "@/components/Layouts/sidebar/icons";
import { formatPercent } from "@/lib/format";
import type { Metadata } from "next";
import Link from "next/link";
import { CampanhasTableClient } from "../campanhas/_components/campanhas-table-client";
import { StatCard } from "./_components/stat-card";
import { loadPainel } from "./_data/load-painel";

export const metadata: Metadata = { title: "Painel" };

const WHATSAPP_STEPS = [
  ["1", "Envie texto, fotos e PDF do imóvel no grupo de entrada."],
  ["2", "Receba o resumo com o público estimado."],
  ["3", "Responda CONFIRMAR para iniciar ou CANCELAR para descartar."],
  ["4", "Responda STATUS a qualquer momento para ver o andamento."],
] as const;

export default async function PainelPage() {
  const data = await loadPainel();
  const deliveryRate = data.accepted ? data.delivered / data.accepted : null;

  return (
    <>
      <Breadcrumb pageName="Painel" />

      {data.status === "unconfigured" && <CadastroListUnconfigured />}
      {data.status === "error" && data.message && <CadastroListError message={data.message} />}

      <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-4 2xl:gap-7.5">
        <StatCard label="Contatos ativos" value={data.activeContacts} Icon={Icons.User} hint="Somente quem tem consentimento recebe campanhas." />
        <StatCard
          label="Campanhas em andamento"
          value={data.runningCampaigns}
          Icon={Icons.ChatBubble}
          hint={data.awaitingConfirmation ? `${data.awaitingConfirmation} aguardando confirmação` : undefined}
        />
        <StatCard
          label="Mensagens entregues"
          value={data.delivered}
          Icon={Icons.PieChart}
          hint={`Taxa de entrega: ${formatPercent(deliveryRate)} das aceitas pelo provedor`}
        />
        <StatCard label="Descadastros" value={data.optOuts} Icon={Icons.ClipboardDocument} hint="Números na lista de supressão." />
      </div>

      <div className="mt-4 grid gap-4 md:mt-6 md:gap-6 xl:grid-cols-3 2xl:mt-9 2xl:gap-7.5">
        <ListCard
          className="xl:col-span-2"
          title="Últimas campanhas"
          actions={
            <Link href="/campanhas" className="text-body-sm font-medium text-primary hover:underline">
              Ver todas
            </Link>
          }
        >
          <CampanhasTableClient rows={data.recentCampaigns} compact />
        </ListCard>

        <ListCard title="Divulgação pelo WhatsApp">
          <ol className="space-y-4">
            {WHATSAPP_STEPS.map(([n, text]) => (
              <li key={n} className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{n}</span>
                <span className="text-body-sm text-dark-4 dark:text-dark-6">{text}</span>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-body-xs text-dark-6">
            Contatos que respondem SAIR ou PARAR são descadastrados automaticamente.
          </p>
        </ListCard>
      </div>
    </>
  );
}
