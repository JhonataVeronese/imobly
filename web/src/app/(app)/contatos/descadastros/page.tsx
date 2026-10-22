import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import { CadastroListAlert } from "@/components/cadastros/cadastro-list-alert";
import { ListCard, TABLE_HEADER_ROW_CLASS } from "@/components/cadastros/list-card";
import { PageIntro } from "@/components/cadastros/page-intro";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SAAS } from "@/lib/api/saas-endpoints";
import { formatDateTime, formatPhone } from "@/lib/format";
import { fetchSaasList } from "@/lib/server/saas-list";
import type { SuppressionEntry } from "@/types/contato";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Descadastros" };

const REASON_LABEL: Record<string, string> = {
  contact_request: "Pedido do contato (WhatsApp)",
  manual: "Painel",
  opt_out: "Descadastro",
};

export default async function DescadastrosPage() {
  const result = await fetchSaasList<SuppressionEntry>(SAAS.suppressionList, { requireTenantId: true });

  return (
    <>
      <Breadcrumb pageName="Descadastros" parent={{ name: "Contatos", href: "/contatos" }} />
      <PageIntro description="Lista de supressão da imobiliária. Estes números são excluídos de todas as campanhas e não são reativados automaticamente." />
      <CadastroListAlert result={result} />
      <ListCard title={`Números suprimidos (${result.data.length})`}>
        <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className={TABLE_HEADER_ROW_CLASS}>
                <TableHead className="xl:pl-7.5">WhatsApp</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Campanha</TableHead>
                <TableHead className="xl:pr-7.5">Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-dark-6">
                    Nenhum descadastro registrado.
                  </TableCell>
                </TableRow>
              ) : (
                result.data.map((s) => (
                  <TableRow key={s.id} className="border-[#eee] dark:border-dark-3">
                    <TableCell className="text-dark dark:text-white xl:pl-7.5">{formatPhone(s.phoneE164)}</TableCell>
                    <TableCell className="text-body-sm text-dark dark:text-white">{REASON_LABEL[s.reason] ?? s.reason}</TableCell>
                    <TableCell className="text-body-sm text-dark-6">{s.source}</TableCell>
                    <TableCell className="text-body-sm">
                      {s.campaignId ? (
                        <Link href={`/campanhas/${s.campaignId}`} className="text-primary hover:underline">
                          ver campanha
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-body-sm text-dark dark:text-white xl:pr-7.5">{formatDateTime(s.createdAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </ListCard>
    </>
  );
}
