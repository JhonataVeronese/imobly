import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import { CadastroListAlert } from "@/components/cadastros/cadastro-list-alert";
import { ListCard, TABLE_HEADER_ROW_CLASS } from "@/components/cadastros/list-card";
import { PageIntro } from "@/components/cadastros/page-intro";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SAAS } from "@/lib/api/saas-endpoints";
import { formatPhone } from "@/lib/format";
import { fetchSaasList } from "@/lib/server/saas-list";
import { ROLE_LABEL, type UserListItem } from "@/types/configuracao";
import type { Metadata } from "next";
import { UsuarioEditButton } from "./_components/usuario-edit-button";
import { UsuarioForm } from "./_components/usuario-form";

export const metadata: Metadata = { title: "Usuários" };

export default async function UsuariosPage() {
  const result = await fetchSaasList<UserListItem>(SAAS.users, { requireTenantId: true });

  return (
    <>
      <Breadcrumb pageName="Usuários" />
      <PageIntro description="Usuários do painel. O WhatsApp cadastrado define quem pode enviar imóveis pelo canal de entrada." />
      <CadastroListAlert result={result} />
      <div className="space-y-6">
        <ListCard>
          <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow className={TABLE_HEADER_ROW_CLASS}>
                  <TableHead className="xl:pl-7.5">Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>WhatsApp autorizado</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right xl:pr-7.5">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.data.map((u) => (
                  <TableRow key={u.id} className="border-[#eee] dark:border-dark-3">
                    <TableCell className="font-medium text-dark dark:text-white xl:pl-7.5">{u.name}</TableCell>
                    <TableCell className="text-body-sm text-dark dark:text-white">{u.email}</TableCell>
                    <TableCell className="text-body-sm text-dark dark:text-white">{u.phoneE164 ? formatPhone(u.phoneE164) : "—"}</TableCell>
                    <TableCell className="text-body-sm text-dark dark:text-white">{ROLE_LABEL[u.role]}</TableCell>
                    <TableCell>
                      <StatusBadge status={u.status} />
                    </TableCell>
                    <TableCell className="text-right xl:pr-7.5">
                      <UsuarioEditButton user={u} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </ListCard>
        <UsuarioForm />
      </div>
    </>
  );
}
