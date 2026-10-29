"use client";

import { cn } from "@/lib/utils";
import type { CampaignDetail } from "@/types/campanha";
import { useEffect, useId, useState } from "react";

interface CampanhaConfirmDialogProps {
  campaign: CampaignDetail | null;
  warning?: string | null;
  onConfirm?: () => void;
  onCancel?: () => void;
  isOpen?: boolean;
}

export function CampanhaConfirmDialog({ campaign, warning, onConfirm, onCancel, isOpen = false }: CampanhaConfirmDialogProps) {
  const titleId = useId();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onCancel, busy]);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      onConfirm?.();
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen || !campaign) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3 sm:p-4"
      role="presentation"
      onClick={() => !busy && onCancel?.()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "w-full max-w-md rounded-[10px] border border-stroke bg-white p-6 shadow-2",
          "dark:border-dark-3 dark:bg-gray-dark sm:p-8",
        )}
        onClick={(ev) => ev.stopPropagation()}
      >
        <h3 id={titleId} className="text-lg font-semibold text-dark dark:text-white sm:text-xl">
          Confirmar Campanha
        </h3>
        <p className="mt-2 text-body-sm text-dark-4 dark:text-dark-6">{campaign.name}</p>

        <div className="mt-4 space-y-4">
          {warning && (
            <div className="rounded-lg border-l-4 border-[#F59E0B] bg-[#FEF3C7] p-4 dark:bg-[#78350F] dark:text-[#FCD34D]">
              <div className="flex gap-3">
                <div className="flex-shrink-0 text-lg">⚠️</div>
                <div className="text-sm">{warning}</div>
              </div>
            </div>
          )}

          <div className="space-y-1 text-body-sm text-dark-6">
            <p>
              <strong className="text-dark dark:text-white">Elegíveis:</strong> {campaign.eligibleCount} contato(s)
            </p>
            {campaign.property && (
              <p>
                <strong className="text-dark dark:text-white">Imóvel:</strong> {campaign.property.title}
              </p>
            )}
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            disabled={busy}
            className={cn(
              "rounded-full px-5 py-2.5 text-sm font-medium transition-colors",
              "bg-dark-2 text-white hover:bg-dark-3",
              "disabled:opacity-50 dark:bg-dark-3 dark:hover:bg-dark-4",
            )}
            onClick={() => onCancel?.()}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            className={cn(
              "rounded-full px-5 py-2.5 text-sm font-medium transition-colors",
              "bg-primary font-semibold text-primary-foreground hover:opacity-90",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              "disabled:opacity-50",
            )}
            onClick={() => void handleConfirm()}
          >
            {busy ? "Aguarde…" : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
