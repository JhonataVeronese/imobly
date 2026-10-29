"use client";

import { FormFeedback } from "@/components/cadastros/form-feedback";
import { ListCard } from "@/components/cadastros/list-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBRL, formatDateTime, formatDuration, formatPercent } from "@/lib/format";
import { getCampaign, runCampaignAction } from "@/services/campanhas.service";
import type { CampaignAction, CampaignDetail, ConfirmCampaignResult } from "@/types/campanha";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CampanhaActions } from "./campanha-actions";
import { CampanhaRecipientsClient } from "./campanha-recipients-client";
import { CampanhaContatosSelector } from "./campanha-contatos-selector";

const LIVE_STATUSES = new Set(["processing", "awaiting_confirmation"]);
const POLL_MS = 4000;

const ACTION_DONE: Record<CampaignAction, string> = {
  confirm: "Envio iniciado.",
  pause: "Campanha pausada. Nenhuma nova mensagem será enviada até retomar.",
  resume: "Envio retomado.",
  cancel: "Campanha cancelada.",
};

function isConfirmResult(value: unknown): value is ConfirmCampaignResult {
  return typeof value === "object" && value !== null && "alreadyConfirmed" in value;
}

export function CampanhaDetailClient({ initial }: { initial: CampaignDetail }) {
  const [campaign, setCampaign] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ variant: "success" | "error"; text: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = useCallback(async () => {
    setCampaign(await getCampaign(initial.id));
    setRefreshKey((k) => k + 1);
  }, [initial.id]);

  useEffect(() => {
    if (!LIVE_STATUSES.has(campaign.status)) return;
    const timer = setInterval(() => void reload().catch(() => undefined), POLL_MS);
    return () => clearInterval(timer);
  }, [campaign.status, reload]);

  const handleAction = async (action: CampaignAction) => {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await runCampaignAction(campaign.id, action);
      const already = isConfirmResult(result) && result.alreadyConfirmed;
      setFeedback({ variant: "success", text: already ? "Esta campanha já estava confirmada." : ACTION_DONE[action] });
      await reload();
    } catch (e) {
      setFeedback({ variant: "error", text: e instanceof Error ? e.message : "Não foi possível concluir a ação." });
      // Repassa o erro para o diálogo de confirmação exibir a mensagem.
      if (action === "confirm" || action === "cancel") throw e;
    } finally {
      setBusy(false);
    }
  };

  const m = campaign.metrics;
  const metrics: [string, string | number][] = [
    ["Elegíveis", campaign.eligibleCount],
    ["Na fila", m.queued],
    ["Aceitas pelo provedor", m.accepted],
    ["Entregues", m.delivered],
    ["Lidas", m.read],
    ["Falhas", m.failed],
    ["Resultado desconhecido", m.unknown],
    ["Canceladas", m.cancelled],
    ["Descadastros", m.optOuts],
    ["Taxa de entrega", formatPercent(m.deliveryRate)],
    ["Taxa de leitura", formatPercent(m.readRate)],
    ["Duração", formatDuration(m.durationMs)],
  ];

  return (
    <div className="space-y-6">
      {feedback && <FormFeedback variant={feedback.variant}>{feedback.text}</FormFeedback>}

      <ListCard>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={campaign.status} />
              {LIVE_STATUSES.has(campaign.status) && <span className="text-body-xs text-dark-6">Atualizando automaticamente</span>}
            </div>
            {campaign.statusReason && <p className="text-body-sm text-[#D97706]">Motivo: {campaign.statusReason}</p>}
            {campaign.property && (
              <p className="text-body-sm text-dark-4 dark:text-dark-6">
                Imóvel:{" "}
                <Link href={`/imoveis/${campaign.propertyId}/editar`} className="font-medium text-primary hover:underline">
                  {campaign.property.title ?? "Sem título"}
                </Link>{" "}
                · {formatBRL(campaign.property.price)} · {campaign.property.assets.length} arquivo(s)
              </p>
            )}
            <p className="text-body-xs text-dark-6">
              Criada {formatDateTime(campaign.createdAt)} · Confirmada {formatDateTime(campaign.confirmedAt)} · Concluída{" "}
              {formatDateTime(campaign.completedAt)}
            </p>
          </div>
          <CampanhaActions
            status={campaign.status}
            eligibleCount={campaign.eligibleCount}
            manualSelection={Boolean(campaign.audience?.contactIds?.length)}
            busy={busy}
            onAction={handleAction}
          />
        </div>

        <dl className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          {metrics.map(([label, value]) => (
            <div key={label} className="rounded-lg bg-gray-2 px-4 py-3 dark:bg-dark-2">
              <dt className="text-body-xs text-dark-6">{label}</dt>
              <dd className="mt-1 text-lg font-bold text-dark dark:text-white">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-body-xs text-dark-6">
          Entrega = entregues ÷ aceitas pelo provedor. Leitura = lidas ÷ entregues (contatos podem desativar a confirmação de
          leitura — isso não é falha). &quot;Desconhecida&quot; = o provedor não respondeu a tempo; a mensagem não é reenviada
          automaticamente para evitar duplicidade.
        </p>
      </ListCard>

      {campaign.status === "awaiting_confirmation" && <CampanhaContatosSelector campaign={campaign} onSaved={reload} />}

      <ListCard title="Mensagem">
        <pre className="whitespace-pre-wrap rounded-lg bg-gray-2 p-4 font-sans text-body-sm text-dark dark:bg-dark-2 dark:text-white">
          {campaign.messageTemplate}
        </pre>
      </ListCard>

      <CampanhaRecipientsClient campaignId={campaign.id} refreshKey={refreshKey} />
    </div>
  );
}
