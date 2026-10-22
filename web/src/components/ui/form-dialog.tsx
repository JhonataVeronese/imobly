"use client";

import { cn } from "@/lib/utils";
import { useEffect, useId, type PropsWithChildren } from "react";

type Props = PropsWithChildren<{
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Bloqueia fechar por ESC/overlay enquanto salva. */
  busy?: boolean;
}>;

/** Diálogo com formulário — mesmo overlay e painel do `ConfirmDeleteDialog` do template. */
export function FormDialog({ open, onClose, title, description, busy = false, children }: Props) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, busy]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3 sm:p-4" role="presentation" onClick={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn("w-full max-w-lg rounded-[10px] border border-stroke bg-white p-6 shadow-2", "dark:border-dark-3 dark:bg-gray-dark sm:p-8")}
        onClick={(ev) => ev.stopPropagation()}
      >
        <h3 id={titleId} className="text-lg font-semibold text-dark dark:text-white sm:text-xl">
          {title}
        </h3>
        {description && <p className="mt-3 text-body-sm text-dark-4 dark:text-dark-6">{description}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
