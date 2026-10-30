import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import { CadastroListAlert } from "@/components/cadastros/cadastro-list-alert";
import { ListCard, TABLE_HEADER_ROW_CLASS } from "@/components/cadastros/list-card";
import { PageIntro } from "@/components/cadastros/page-intro";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SAAS } from "@/lib/api/saas-endpoints";
import { formatDate } from "@/lib/format";
import { fetchSaasList } from "@/lib/server/saas-list";
import type { AdminTenant } from "@/types/configuracao";
import type { Metadata } from "next";
import Link from "next/link";
import { NovoClienteForm } from "./_components/novo-cliente-form";

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientesPage() {
  const result = await fetchSaasList<AdminTenant>(SAAS.adminTenants, { skipTenantHeader: true });

  return (
    <>
      <Breadcrumb pageName="Clientes" />
      <PageIntro description="Imobiliárias que usam a plataforma. Em cada cliente você cadastra os corretores e conecta o WhatsApp." />
      <CadastroListAlert result={result} />
      <div className="space-y-6">
        <ListCard title={`Clientes (${result.data.length})`}>
          <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow className={TABLE_HEADER_ROW_CLASS}>
                  <TableHead className="xl:pl-7.5">Cliente</TableHead>
                  <TableHead>Corretores</TableHead>
                  <TableHead>Conexões</TableHead>
                  <TableHead>Contatos</TableHead>
                  <TableHead>Campanhas</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right xl:pr-7.5">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-dark-6">
                      Nenhum cliente ainda. Cadastre o primeiro abaixo.
                    </TableCell>
                  </TableRow>
                ) : (
                  result.data.map((t) => (
                    <TableRow key={t.id} className="border-[#eee] dark:border-dark-3">
                      <TableCell className="xl:pl-7.5">
                        <Link href={`/admin/clientes/${t.id}`} className="font-medium text-dark hover:underline dark:text-white">
                          {t.tradeName || t.name}
                        </Link>
                        <p className="text-body-xs text-dark-6">
                          {t.tradeName ? `${t.name} · ` : ""}desde {formatDate(t.createdAt)}
                        </p>
                      </TableCell>
                      <TableCell className="text-body-sm text-dark dark:text-white">{t._count.users}</TableCell>
                      <TableCell className="text-body-sm text-dark dark:text-white">{t._count.providerAccounts}</TableCell>
                      <TableCell className="text-body-sm text-dark dark:text-white">{t._count.contacts}</TableCell>
                      <TableCell className="text-body-sm text-dark dark:text-white">{t._count.campaigns}</TableCell>
                      <TableCell>
                        <StatusBadge status={t.status} />
                      </TableCell>
                      <TableCell className="text-right xl:pr-7.5">
                        <Link href={`/admin/clientes/${t.id}`} className="text-body-sm font-medium text-primary hover:underline">
                          Gerenciar
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </ListCard>
        <NovoClienteForm />
      </div>
    </>
  );
}
