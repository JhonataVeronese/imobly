"use client";

import { TABLE_HEADER_ROW_CLASS } from "@/components/cadastros/list-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL, formatDateTime } from "@/lib/format";
import type { CampaignListItem } from "@/types/campanha";
import Link from "next/link";

type Props = {
  rows: CampaignListItem[];
  /** Versão resumida para o painel. */
  compact?: boolean;
};

export function CampanhasTableClient({ rows, compact = false }: Props) {
  const columns = compact ? 4 : 7;
  return (
    <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
      <Table className={compact ? "min-w-[560px]" : "min-w-[900px]"}>
        <TableHeader>
          <TableRow className={TABLE_HEADER_ROW_CLASS}>
            <TableHead className="min-w-[220px] xl:pl-7.5">Campanha</TableHead>
            <TableHead>Status</TableHead>
            {!compact && <TableHead className="text-right">Elegíveis</TableHead>}
            <TableHead className="text-right">Entregues</TableHead>
            {!compact && <TableHead className="text-right">Falhas</TableHead>}
            {!compact && <TableHead className="text-right">Descadastros</TableHead>}
            <TableHead className="xl:pr-7.5">Criada em</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns} className="py-10 text-center text-dark-6">
                Nenhuma campanha ainda. Envie um imóvel pelo grupo do WhatsApp ou cadastre em &quot;Imóveis&quot;.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((c) => (
              <TableRow key={c.id} className="border-[#eee] dark:border-dark-3">
                <TableCell className="xl:pl-7.5">
                  <Link href={`/campanhas/${c.id}`} className="font-medium text-dark hover:text-primary dark:text-white">
                    {c.name}
                  </Link>
                  <p className="text-body-sm text-dark-6">{formatBRL(c.property?.price)}</p>
                  {c.statusReason && <p className="text-body-xs text-[#D97706]">{c.statusReason}</p>}
                </TableCell>
                <TableCell>
                  <StatusBadge status={c.status} />
                </TableCell>
                {!compact && <TableCell className="text-right text-dark dark:text-white">{c.eligibleCount}</TableCell>}
                <TableCell className="text-right text-dark dark:text-white">
                  {c.metrics.delivered}
                  <span className="text-dark-6"> / {c.metrics.recipients || c.eligibleCount}</span>
                </TableCell>
                {!compact && <TableCell className="text-right text-dark dark:text-white">{c.metrics.failed + c.metrics.unknown}</TableCell>}
                {!compact && <TableCell className="text-right text-dark dark:text-white">{c.metrics.optOuts}</TableCell>}
                <TableCell className="text-body-sm text-dark dark:text-white xl:pr-7.5">{formatDateTime(c.createdAt)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
