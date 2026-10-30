import { TABLE_HEADER_ROW_CLASS } from "@/components/cadastros/list-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { AuditLogItem } from "@/types/configuracao";

const ACTION_LABEL: Record<string, string> = {
  "tenant.created": "Cliente cadastrado",
  "tenant.updated": "Dados do cliente alterados",
  "consent.granted": "Consentimento registrado",
  "consent.reactivated": "Número reativado",
  "consent.revoked": "Descadastro",
  "contacts.imported": "Importação de contatos",
  "campaign.created": "Campanha criada",
  "campaign.confirmed": "Campanha confirmada",
  "campaign.paused": "Campanha pausada",
  "campaign.resumed": "Campanha retomada",
  "campaign.cancelled": "Campanha cancelada",
  "campaign.completed": "Campanha concluída",
  "property.ingested": "Imóvel recebido pelo WhatsApp",
  "provider_account.created": "Conexão criada",
  "provider_account.updated": "Conexão alterada",
  "provider_account.webhook_rotated": "URL de webhook regenerada",
  "inbound.unauthorized_sender": "Remetente não autorizado",
  "user.created": "Corretor criado",
  "user.updated": "Corretor alterado",
};

const ACTOR_LABEL: Record<string, string> = { user: "Usuário", contact: "Contato", system: "Sistema" };

/** Ações administrativas e alterações de consentimento do cliente (últimos 200 registros). */
export function AuditTable({ rows }: { rows: AuditLogItem[] }) {
  return (
    <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
      <Table className="min-w-[860px]">
        <TableHeader>
          <TableRow className={TABLE_HEADER_ROW_CLASS}>
            <TableHead className="xl:pl-7.5">Data</TableHead>
            <TableHead>Ação</TableHead>
            <TableHead>Autor</TableHead>
            <TableHead className="xl:pr-7.5">Detalhes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="py-10 text-center text-dark-6">
                Nenhum registro ainda.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((l) => (
              <TableRow key={l.id} className="border-[#eee] dark:border-dark-3">
                <TableCell className="whitespace-nowrap text-body-sm text-dark dark:text-white xl:pl-7.5">{formatDateTime(l.createdAt)}</TableCell>
                <TableCell className="text-body-sm font-medium text-dark dark:text-white">{ACTION_LABEL[l.action] ?? l.action}</TableCell>
                <TableCell className="text-body-sm text-dark-6">{ACTOR_LABEL[l.actorType] ?? l.actorType}</TableCell>
                <TableCell className="max-w-[420px] break-all font-mono text-body-xs text-dark-6 xl:pr-7.5">{JSON.stringify(l.data)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
