"use client";

import { PencilSquareIcon } from "@/assets/icons";
import { TABLE_HEADER_ROW_CLASS } from "@/components/cadastros/list-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL, formatDate } from "@/lib/format";
import type { PropertyListItem } from "@/types/imovel";
import Link from "next/link";
import { CreateCampaignButton } from "./create-campaign-button";

function facts(p: PropertyListItem): string {
  return [
    p.bedrooms != null && `${p.bedrooms} qto(s)`,
    p.suites != null && `${p.suites} suíte(s)`,
    p.parkingSpaces != null && `${p.parkingSpaces} vaga(s)`,
    p.areaM2 != null && `${Number(p.areaM2)} m²`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ImoveisTableClient({ rows }: { rows: PropertyListItem[] }) {
  return (
    <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
      <Table className="min-w-[960px]">
        <TableHeader>
          <TableRow className={TABLE_HEADER_ROW_CLASS}>
            <TableHead className="min-w-[240px] xl:pl-7.5">Imóvel</TableHead>
            <TableHead>Preço</TableHead>
            <TableHead>Localização</TableHead>
            <TableHead>Características</TableHead>
            <TableHead>Arquivos</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right xl:pr-7.5">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-dark-6">
                Nenhum imóvel. Envie pelo grupo do WhatsApp ou use &quot;Novo imóvel&quot;.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((p) => {
              const photos = p.assets.filter((a) => a.kind === "image").length;
              const pdfs = p.assets.length - photos;
              return (
                <TableRow key={p.id} className="border-[#eee] dark:border-dark-3">
                  <TableCell className="xl:pl-7.5">
                    <p className="font-medium text-dark dark:text-white">{p.title ?? "Sem título"}</p>
                    <p className="text-body-sm text-dark-6">
                      {p.propertyType ?? "tipo não informado"} · cadastrado em {formatDate(p.createdAt)}
                    </p>
                  </TableCell>
                  <TableCell className="text-dark dark:text-white">{formatBRL(p.price)}</TableCell>
                  <TableCell className="text-body-sm text-dark dark:text-white">
                    {[p.neighborhood, p.city].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-body-sm text-dark dark:text-white">{facts(p) || "—"}</TableCell>
                  <TableCell className="text-body-sm text-dark dark:text-white">
                    {photos} foto(s), {pdfs} PDF(s)
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className="xl:pr-7.5">
                    <div className="flex items-center justify-end gap-x-3.5">
                      <CreateCampaignButton propertyId={p.id} variant="link" disabled={p.status === "archived"} />
                      <Link href={`/imoveis/${p.id}/editar`} className="text-dark-6 hover:text-primary" title="Corrigir dados" aria-label="Corrigir dados">
                        <PencilSquareIcon />
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
