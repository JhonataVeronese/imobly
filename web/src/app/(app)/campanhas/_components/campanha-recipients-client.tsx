"use client";

import { CadastroListError } from "@/components/cadastros/cadastro-list-alert";
import { SECONDARY_BUTTON_CLASS } from "@/components/cadastros/form-feedback";
import { ListCard, TABLE_HEADER_ROW_CLASS } from "@/components/cadastros/list-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatPhone } from "@/lib/format";
import { listRecipients } from "@/services/campanhas.service";
import { MESSAGE_STATUSES, type MessageStatus, type RecipientsPage } from "@/types/campanha";
import { useEffect, useState } from "react";

const PAGE_SIZE = 100;
const PART_LABEL: Record<string, string> = { text: "Texto", image: "Imagem", document: "PDF" };

type Props = { campaignId: string; refreshKey: number };

export function CampanhaRecipientsClient({ campaignId, refreshKey }: Props) {
  const [status, setStatus] = useState<MessageStatus | null>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RecipientsPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listRecipients(campaignId, status, page)
      .then((r) => {
        if (!active) return;
        setData(r);
        setError(null);
      })
      .catch((e: unknown) => active && setError(e instanceof Error ? e.message : "Falha ao carregar destinatários"));
    return () => {
      active = false;
    };
  }, [campaignId, status, page, refreshKey]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <ListCard
      title={`Destinatários${data ? ` (${data.total})` : ""}`}
      actions={
        <select
          aria-label="Filtrar por status"
          value={status ?? ""}
          onChange={(e) => {
            setPage(1);
            setStatus((e.target.value || null) as MessageStatus | null);
          }}
          className="rounded-lg border border-stroke bg-transparent px-4 py-2 text-body-sm outline-none focus:border-primary dark:border-dark-3 dark:bg-dark-2"
        >
          <option value="">Todos os status</option>
          {MESSAGE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      }
    >
      {error && <CadastroListError message={error} />}
      <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow className={TABLE_HEADER_ROW_CLASS}>
              <TableHead className="xl:pl-7.5">Contato</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Partes</TableHead>
              <TableHead className="text-right">Tentativas</TableHead>
              <TableHead>Erro</TableHead>
              <TableHead>Entregue</TableHead>
              <TableHead className="xl:pr-7.5">Lida</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data || data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-dark-6">
                  {data ? "Nenhum destinatário com este filtro." : "Carregando…"}
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((r) => (
                <TableRow key={r.id} className="border-[#eee] dark:border-dark-3">
                  <TableCell className="xl:pl-7.5">
                    <p className="font-medium text-dark dark:text-white">{r.contact.name}</p>
                    <p className="text-body-sm text-dark-6">{formatPhone(r.phoneE164)}</p>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-body-sm text-dark dark:text-white">
                    {r.messages.map((p) => (
                      <div key={p.part}>
                        {PART_LABEL[p.kind] ?? p.kind}: {p.status}
                      </div>
                    ))}
                  </TableCell>
                  <TableCell className="text-right text-dark dark:text-white">{r.attemptCount}</TableCell>
                  <TableCell className="text-body-sm text-red">{r.errorCode ?? ""}</TableCell>
                  <TableCell className="text-body-sm text-dark dark:text-white">{formatDateTime(r.deliveredAt)}</TableCell>
                  <TableCell className="text-body-sm text-dark dark:text-white xl:pr-7.5">{formatDateTime(r.readAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-end gap-3">
          <button type="button" className={SECONDARY_BUTTON_CLASS} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </button>
          <span className="text-body-sm text-dark-6">
            Página {page} de {totalPages}
          </span>
          <button type="button" className={SECONDARY_BUTTON_CLASS} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Próxima
          </button>
        </div>
      )}
    </ListCard>
  );
}
