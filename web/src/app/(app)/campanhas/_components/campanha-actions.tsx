"use client";

import { DANGER_BUTTON_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/components/cadastros/form-feedback";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import type { CampaignAction, CampaignStatus } from "@/types/campanha";
import { useState } from "react";

type Props = {
  status: CampaignStatus;
  eligibleCount: number;
  busy: boolean;
  onAction: (action: CampaignAction) => Promise<void>;
};

const CANCELLABLE: readonly CampaignStatus[] = ["draft", "awaiting_confirmation", "scheduled", "processing", "paused"];

/** Ações permitidas pelo estado atual (a API valida as mesmas transições). */
export function CampanhaActions({ status, eligibleCount, busy, onAction }: Props) {
  const [dialog, setDialog] = useState<"confirm" | "cancel" | null>(null);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        {status === "awaiting_confirmation" && (
          <button type="button" disabled={busy} className={PRIMARY_BUTTON_CLASS} onClick={() => setDialog("confirm")}>
            Confirmar envio
          </button>
        )}
        {(status === "processing" || status === "scheduled") && (
          <button type="button" disabled={busy} className={SECONDARY_BUTTON_CLASS} onClick={() => void onAction("pause")}>
            Pausar
          </button>
        )}
        {status === "paused" && (
          <button type="button" disabled={busy} className={PRIMARY_BUTTON_CLASS} onClick={() => void onAction("resume")}>
            Retomar envio
          </button>
        )}
        {CANCELLABLE.includes(status) && (
          <button type="button" disabled={busy} className={DANGER_BUTTON_CLASS} onClick={() => setDialog("cancel")}>
            Cancelar campanha
          </button>
        )}
      </div>

      <ConfirmDeleteDialog
        open={dialog === "confirm"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Iniciar o envio para ${eligibleCount} contatos?`}
        description="O público é recalculado no momento da confirmação: só recebem contatos com consentimento vigente e fora da lista de descadastro."
        confirmLabel="Iniciar envio"
        onConfirm={() => onAction("confirm")}
      />
      <ConfirmDeleteDialog
        open={dialog === "cancel"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Cancelar esta campanha?"
        description="Mensagens ainda na fila não serão enviadas. As que o provedor já aceitou não podem ser desfeitas."
        confirmLabel="Cancelar campanha"
        cancelLabel="Voltar"
        onConfirm={() => onAction("cancel")}
      />
    </>
  );
}
