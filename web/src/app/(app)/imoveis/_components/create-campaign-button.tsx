"use client";

import { PRIMARY_BUTTON_CLASS } from "@/components/cadastros/form-feedback";
import { createCampaign } from "@/services/campanhas.service";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = { propertyId: string; variant?: "button" | "link"; disabled?: boolean };

/** Cria a campanha em "aguardando confirmação" e abre o detalhe para revisão — não envia nada. */
export function CreateCampaignButton({ propertyId, variant = "button", disabled }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setBusy(true);
    setError(null);
    try {
      const campaign = await createCampaign(propertyId);
      router.push(`/campanhas/${campaign.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível criar a campanha.");
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy || disabled}
        onClick={() => void handleClick()}
        className={variant === "link" ? "text-body-sm font-medium text-primary hover:underline disabled:opacity-50" : PRIMARY_BUTTON_CLASS}
      >
        {busy ? "Criando…" : "Nova campanha"}
      </button>
      {error && <span className="max-w-[260px] text-right text-body-xs text-red">{error}</span>}
    </span>
  );
}
