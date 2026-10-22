"use client";

import { TABLE_HEADER_ROW_CLASS } from "@/components/cadastros/list-card";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { rotateWebhook } from "@/services/configuracoes.service";
import type { ProviderAccount } from "@/types/configuracao";
import { useState } from "react";
import { WebhookUrlNotice } from "./webhook-url-notice";

const PROVIDER_LABEL: Record<string, string> = { zapi: "Z-API", fake: "Simulado (desenvolvimento)" };

export function AccountsTableClient({ rows }: { rows: ProviderAccount[] }) {
  const [rotateTarget, setRotateTarget] = useState<ProviderAccount | null>(null);
  const [newUrl, setNewUrl] = useState<string | null>(null);

  return (
    <>
      {newUrl && <WebhookUrlNotice url={newUrl} onClose={() => setNewUrl(null)} />}
      <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow className={TABLE_HEADER_ROW_CLASS}>
              <TableHead className="xl:pl-7.5">Provedor</TableHead>
              <TableHead>Instância</TableHead>
              <TableHead>Canal de entrada</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right xl:pr-7.5">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-dark-6">
                  Nenhuma integração. Conecte a Z-API abaixo.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((a) => (
                <TableRow key={a.id} className="border-[#eee] dark:border-dark-3">
                  <TableCell className="xl:pl-7.5">
                    <p className="font-medium text-dark dark:text-white">{PROVIDER_LABEL[a.provider] ?? a.provider}</p>
                    <p className="text-body-xs text-dark-6">desde {formatDate(a.createdAt)}</p>
                  </TableCell>
                  <TableCell className="font-mono text-body-sm text-dark dark:text-white">{a.accountReference}</TableCell>
                  <TableCell className="text-body-sm text-dark dark:text-white">
                    {a.inboundMode === "group" ? `Grupo ${a.inboundChatId ?? ""}` : "Mensagem direta"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={a.status} />
                  </TableCell>
                  <TableCell className="text-right xl:pr-7.5">
                    <button type="button" className="text-body-sm font-medium text-primary hover:underline" onClick={() => setRotateTarget(a)}>
                      Gerar nova URL de webhook
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <ConfirmDeleteDialog
        open={rotateTarget !== null}
        onOpenChange={(open) => !open && setRotateTarget(null)}
        title="Gerar uma nova URL de webhook?"
        description="A URL atual deixa de funcionar imediatamente. Atualize-a no painel da Z-API logo em seguida."
        confirmLabel="Gerar nova URL"
        onConfirm={async () => {
          if (!rotateTarget) return;
          setNewUrl((await rotateWebhook(rotateTarget.id)).webhookUrl);
        }}
      />
    </>
  );
}
