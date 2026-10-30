"use client";

import { TABLE_HEADER_ROW_CLASS } from "@/components/cadastros/list-card";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { rotateWebhook, setProviderAccountStatus } from "@/services/admin.service";
import type { ProviderAccount } from "@/types/configuracao";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { WebhookUrlNotice } from "./webhook-url-notice";

const PROVIDER_LABEL: Record<string, string> = {
  zapi: "Z-API",
  omni: "Omni Z-API",
  fake: "Simulado (desenvolvimento)",
  simulator: "Simulador do painel",
};

type Pending = { kind: "rotate" | "toggle"; account: ProviderAccount };

export function AccountsTableClient({ tenantId, rows }: { tenantId: string; rows: ProviderAccount[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const [newUrl, setNewUrl] = useState<string | null>(null);

  const disabling = pending?.kind === "toggle" && pending.account.status === "active";

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
                  Nenhuma conexão. Conecte o WhatsApp do cliente abaixo.
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
                  <TableCell className="space-x-4 whitespace-nowrap text-right xl:pr-7.5">
                    {a.provider !== "simulator" && (
                      <>
                        <button type="button" className="text-body-sm font-medium text-primary hover:underline" onClick={() => setPending({ kind: "rotate", account: a })}>
                          Nova URL de webhook
                        </button>
                        <button
                          type="button"
                          className={a.status === "active" ? "text-body-sm font-medium text-red hover:underline" : "text-body-sm font-medium text-primary hover:underline"}
                          onClick={() => setPending({ kind: "toggle", account: a })}
                        >
                          {a.status === "active" ? "Desativar" : "Reativar"}
                        </button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <ConfirmDeleteDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={
          pending?.kind === "rotate" ? "Gerar uma nova URL de webhook?" : disabling ? "Desativar esta conexão?" : "Reativar esta conexão?"
        }
        description={
          pending?.kind === "rotate"
            ? "A URL atual deixa de funcionar imediatamente. Na Omni a troca é automática; na Z-API, atualize a URL no painel da instância."
            : disabling
              ? "Os webhooks deste número passam a ser ignorados e ele deixa de ser usado em novas campanhas. Campanhas já em envio por ele precisam ser pausadas."
              : "O número volta a receber mensagens e a poder ser usado em campanhas."
        }
        confirmLabel={pending?.kind === "rotate" ? "Gerar nova URL" : disabling ? "Desativar" : "Reativar"}
        onConfirm={async () => {
          if (!pending) return;
          if (pending.kind === "rotate") {
            setNewUrl((await rotateWebhook(tenantId, pending.account.id)).webhookUrl);
          } else {
            await setProviderAccountStatus(tenantId, pending.account.id, pending.account.status === "active" ? "disabled" : "active");
            router.refresh();
          }
        }}
      />
    </>
  );
}
