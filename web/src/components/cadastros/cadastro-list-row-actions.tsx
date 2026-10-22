"use client";

import { PencilSquareIcon, TrashIcon } from "@/assets/icons";
import {
  ConfirmDeleteDialog,
  parseDeleteConfirmMessage,
} from "@/components/ui/confirm-delete-dialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Props = {
  /** Se omitido, só a exclusão é exibida (ex.: contas bancárias sem tela de edição). */
  editHref?: string;
  editTitle?: string;
  /** Quando `false`, o botão de excluir não é exibido (ex.: cadastros fixos do sistema). */
  showDelete?: boolean;
  /** Retorno ignorado após `await`. */
  onDelete: () => Promise<unknown>;
  /** Texto completo ou "pergunta? aviso" — ver `parseDeleteConfirmMessage`. */
  deleteConfirmMessage: string;
};

/**
 * Ações padrão de listagem: editar (navegação) e excluir (com confirmação + `router.refresh()`).
 */
export function CadastroListRowActions({
  editHref,
  editTitle = "Editar",
  showDelete = true,
  onDelete,
  deleteConfirmMessage,
}: Props) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { title: confirmTitle, description: confirmDescription } = useMemo(
    () => parseDeleteConfirmMessage(deleteConfirmMessage),
    [deleteConfirmMessage],
  );

  const runDelete = async () => {
    await onDelete();
    router.refresh();
  };

  if (!editHref && !showDelete) {
    return (
      <span className="text-body-sm text-dark-6" title="Sem ações disponíveis">
        —
      </span>
    );
  }

  return (
    <>
      <div className="flex items-center justify-end gap-x-3.5">
        {editHref ? (
          <Link
            href={editHref}
            className="text-dark-6 hover:text-primary dark:hover:text-primary"
            title={editTitle}
            aria-label={editTitle}
          >
            <PencilSquareIcon />
          </Link>
        ) : null}
        {showDelete ? (
          <button
            type="button"
            className="text-dark-6 hover:text-red disabled:opacity-50 dark:hover:text-red"
            title="Excluir"
            disabled={confirmOpen}
            onClick={() => setConfirmOpen(true)}
          >
            <span className="sr-only">Excluir</span>
            <TrashIcon />
          </button>
        ) : null}
      </div>

      {showDelete ? (
        <ConfirmDeleteDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={confirmTitle}
          description={confirmDescription}
          onConfirm={runDelete}
        />
      ) : null}
    </>
  );
}
