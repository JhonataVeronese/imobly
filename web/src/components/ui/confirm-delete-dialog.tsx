"use client";

import { cn } from "@/lib/utils";
import { useEffect, useId, useState } from "react";

export type ConfirmDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Título curto (pergunta), ex.: "Excluir este usuário?" */
  title: string;
  /** Texto de aviso abaixo do título. */
  description?: string;
  onConfirm: () => Promise<unknown>;
  /** Rótulo do botão destrutivo (padrão: Excluir). */
  confirmLabel?: string;
  cancelLabel?: string;
};

/**
 * Confirmação de exclusão alinhada ao template (overlay escuro, painel `gray-dark`,
 * botões em pílula: cancelar escuro, confirmar em destaque claro).
 */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel = "Excluir",
  cancelLabel = "Cancelar",
}: ConfirmDeleteDialogProps) {
  const titleId = useId();
  const descId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setError(null);
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange, busy]);

  if (!open) return null;

  const handleConfirm = async () => {
    setError(null);
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Não foi possível concluir a exclusão.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3 sm:p-4"
      role="presentation"
      onClick={() => !busy && onOpenChange(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={cn(
          "w-full max-w-md rounded-[10px] border border-stroke bg-white p-6 shadow-2",
          "dark:border-dark-3 dark:bg-gray-dark sm:p-8",
        )}
        onClick={(ev) => ev.stopPropagation()}
      >
        <h3
          id={titleId}
          className="text-lg font-semibold text-dark dark:text-white sm:text-xl"
        >
          {title}
        </h3>
        {description ? (
          <p
            id={descId}
            className="mt-3 text-body-sm text-dark-4 dark:text-dark-6"
          >
            {description}
          </p>
        ) : null}

        {error ? (
          <p
            className="mt-4 rounded-lg border border-red-light-4 bg-red-light-6 px-3 py-2 text-sm text-red dark:border-red/30 dark:bg-red/10 dark:text-red-light-2"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            disabled={busy}
            className={cn(
              "rounded-full px-5 py-2.5 text-sm font-medium transition-colors",
              "bg-dark-2 text-white hover:bg-dark-3",
              "disabled:opacity-50 dark:bg-dark-3 dark:hover:bg-dark-4",
            )}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
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
            {busy ? "Aguarde…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Extrai título e descrição a partir de uma única string com "?" (padrão das listagens). */
export function parseDeleteConfirmMessage(message: string): {
  title: string;
  description: string;
} {
  const q = message.indexOf("?");
  if (q >= 0) {
    const title = message.slice(0, q + 1).trim();
    const rest = message.slice(q + 1).trim();
    return {
      title,
      description: rest || "Esta ação não pode ser desfeita.",
    };
  }
  return {
    title: message.trim() || "Confirmar exclusão",
    description: "Esta ação não pode ser desfeita.",
  };
}
