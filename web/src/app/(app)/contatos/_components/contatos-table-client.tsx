"use client";

import { TABLE_HEADER_ROW_CLASS } from "@/components/cadastros/list-card";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL, formatDate, formatPhone } from "@/lib/format";
import { optOutContact } from "@/services/contatos.service";
import type { ContactListItem, ContactPreferences } from "@/types/contato";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConsentDialog } from "./consent-dialog";

function preferencesSummary(p: ContactPreferences): string {
  return [
    p.propertyTypes?.join(", "),
    p.neighborhoods?.join(", "),
    p.priceMax != null && `até ${formatBRL(p.priceMax)}`,
    p.bedroomsMin != null && `${p.bedroomsMin}+ qtos`,
    p.investor && "investidor",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ContatosTableClient({ rows }: { rows: ContactListItem[] }) {
  const router = useRouter();
  const [optOutTarget, setOptOutTarget] = useState<ContactListItem | null>(null);
  const [consentTarget, setConsentTarget] = useState<ContactListItem | null>(null);

  return (
    <>
      <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
        <Table className="min-w-[960px]">
          <TableHeader>
            <TableRow className={TABLE_HEADER_ROW_CLASS}>
              <TableHead className="min-w-[200px] xl:pl-7.5">Contato</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead className="min-w-[220px]">Preferências</TableHead>
              <TableHead>Consentimento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right xl:pr-7.5">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-dark-6">
                  Nenhum contato encontrado. Use &quot;Importar CSV&quot; ou &quot;Novo contato&quot;.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((c) => (
                <TableRow key={c.id} className="border-[#eee] dark:border-dark-3">
                  <TableCell className="xl:pl-7.5">
                    <p className="font-medium text-dark dark:text-white">{c.name}</p>
                    <p className="text-body-xs text-dark-6">
                      {c.tags.length ? c.tags.join(", ") : c.source ?? ""} · desde {formatDate(c.createdAt)}
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-body-sm text-dark dark:text-white">{formatPhone(c.phoneE164)}</TableCell>
                  <TableCell className="text-body-sm text-dark-6">{preferencesSummary(c.preferences) || "sem restrições"}</TableCell>
                  <TableCell className="text-body-sm">
                    {c.hasConsent ? (
                      <span className="text-[#219653]">✔ {c.consents[0]?.source}</span>
                    ) : (
                      <span className="text-dark-6">sem consentimento</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.status} />
                  </TableCell>
                  <TableCell className="xl:pr-7.5">
                    <div className="flex items-center justify-end gap-x-4 text-body-sm font-medium">
                      {!c.hasConsent && c.status !== "blocked" && (
                        <button type="button" className="text-primary hover:underline" onClick={() => setConsentTarget(c)}>
                          {c.status === "opted_out" ? "Reativar" : "Registrar consentimento"}
                        </button>
                      )}
                      {c.status === "active" && (
                        <button type="button" className="text-red hover:underline" onClick={() => setOptOutTarget(c)}>
                          Descadastrar
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ConfirmDeleteDialog
        open={optOutTarget !== null}
        onOpenChange={(open) => !open && setOptOutTarget(null)}
        title={`Descadastrar ${optOutTarget?.name ?? "contato"}?`}
        description="O número entra na lista de supressão, os consentimentos são revogados e envios pendentes são cancelados."
        confirmLabel="Descadastrar"
        onConfirm={async () => {
          if (!optOutTarget) return;
          await optOutContact(optOutTarget.id);
          router.refresh();
        }}
      />
      <ConsentDialog contact={consentTarget} onClose={() => setConsentTarget(null)} onSaved={() => router.refresh()} />
    </>
  );
}
