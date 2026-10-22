"use client";

import { TrashIcon } from "@/assets/icons";
import { FormFeedback } from "@/components/cadastros/form-feedback";
import { ShowcaseSection } from "@/components/Layouts/showcase-section";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { deletePropertyAsset, uploadPropertyAssets } from "@/services/imoveis.service";
import type { PropertyAsset } from "@/types/imovel";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const ACCEPT = "image/jpeg,image/png,application/pdf";

function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

type Props = { propertyId: string; assets: PropertyAsset[] };

/** Fotos e PDF do imóvel: a 1ª foto vira a imagem de destaque e o PDF segue como documento. */
export function ImovelAssets({ propertyId, assets }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<PropertyAsset | null>(null);

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      await uploadPropertyAssets(propertyId, Array.from(files));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no envio dos arquivos.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <ShowcaseSection title="Fotos e ficha (PDF)">
      <p className="mb-5 text-body-sm text-dark-4 dark:text-dark-6">
        JPEG, PNG ou PDF. O tipo real do arquivo é conferido no servidor. A primeira foto vai como imagem de destaque com o texto; o PDF
        segue como documento.
      </p>

      {assets.length > 0 && (
        <ul className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {assets.map((a, i) => (
            <li key={a.id} className="flex items-center gap-4 rounded-lg border border-stroke p-3 dark:border-dark-3">
              {a.kind === "image" && a.url ? (
                // URL assinada e temporária do storage — não passa pelo otimizador do Next.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt="" className="size-16 shrink-0 rounded object-cover" />
              ) : (
                <span className="grid size-16 shrink-0 place-items-center rounded bg-gray-2 text-sm font-bold text-dark-5 dark:bg-dark-2">PDF</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-sm font-medium text-dark dark:text-white">{a.originalName ?? (a.kind === "image" ? `Foto ${i + 1}` : "Documento")}</p>
                <p className="text-body-xs text-dark-6">
                  {sizeLabel(a.sizeBytes)}
                  {i === assets.findIndex((x) => x.kind === "image") && a.kind === "image" ? " · destaque" : ""}
                </p>
              </div>
              <button type="button" onClick={() => setToDelete(a)} className="text-dark-6 hover:text-red" title="Remover arquivo">
                <span className="sr-only">Remover</span>
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-gray-4 bg-gray-2 px-4 py-8 text-center hover:border-primary dark:border-dark-3 dark:bg-dark-2 dark:hover:border-primary">
        <input ref={inputRef} type="file" multiple accept={ACCEPT} className="sr-only" disabled={uploading} onChange={(e) => void handleUpload(e.target.files)} />
        <span className="font-medium text-primary">{uploading ? "Enviando…" : "Clique para adicionar arquivos"}</span>
        <span className="mt-1 text-body-xs text-dark-6">até 10 arquivos por vez</span>
      </label>

      {error && <FormFeedback variant="error" className="mt-4">{error}</FormFeedback>}

      <ConfirmDeleteDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Remover este arquivo?"
        description="Não é possível remover arquivos de um imóvel com campanha em andamento."
        confirmLabel="Remover"
        onConfirm={async () => {
          if (!toDelete) return;
          await deletePropertyAsset(propertyId, toDelete.id);
          router.refresh();
        }}
      />
    </ShowcaseSection>
  );
}
