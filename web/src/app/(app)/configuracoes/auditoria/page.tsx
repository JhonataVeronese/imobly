import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import { CadastroListAlert } from "@/components/cadastros/cadastro-list-alert";
import { ListCard, TABLE_HEADER_ROW_CLASS } from "@/components/cadastros/list-card";
import { PageIntro } from "@/components/cadastros/page-intro";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SAAS } from "@/lib/api/saas-endpoints";
import { formatDateTime } from "@/lib/format";
import { fetchSaasList } from "@/lib/server/saas-list";
import type { AuditLogItem } from "@/types/configuracao";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Auditoria" };

const ACTION_LABEL: Record<string, string> = {
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
  "provider_account.created": "Integração criada",
  "provider_account.updated": "Integração alterada",
  "provider_account.webhook_rotated": "URL de webhook regenerada",
  "inbound.unauthorized_sender": "Remetente não autorizado",
  "user.created": "Usuário criado",
};

const ACTOR_LABEL: Record<string, string> = { user: "Usuário", contact: "Contato", system: "Sistema" };

export default async function AuditoriaPage() {
  const result = await fetchSaasList<AuditLogItem>(SAAS.auditLogs, { requireTenantId: true });

  return (
    <>
      <Breadcrumb pageName="Auditoria" />
      <PageIntro description="Ações administrativas e alterações de consentimento (últimos 200 registros)." />
      <CadastroListAlert result={result} />
      <ListCard>
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
              {result.data.map((l) => (
                <TableRow key={l.id} className="border-[#eee] dark:border-dark-3">
                  <TableCell className="whitespace-nowrap text-body-sm text-dark dark:text-white xl:pl-7.5">{formatDateTime(l.createdAt)}</TableCell>
                  <TableCell className="text-body-sm font-medium text-dark dark:text-white">{ACTION_LABEL[l.action] ?? l.action}</TableCell>
                  <TableCell className="text-body-sm text-dark-6">{ACTOR_LABEL[l.actorType] ?? l.actorType}</TableCell>
                  <TableCell className="max-w-[420px] break-all font-mono text-body-xs text-dark-6 xl:pr-7.5">{JSON.stringify(l.data)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </ListCard>
    </>
  );
}
