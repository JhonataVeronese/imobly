import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import { BackToListingLink } from "@/components/cadastros/back-to-listing";
import { CadastroListAlert, CadastroListError, CadastroListUnconfigured } from "@/components/cadastros/cadastro-list-alert";
import { ListCard, TABLE_HEADER_ROW_CLASS } from "@/components/cadastros/list-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SAAS } from "@/lib/api/saas-endpoints";
import { formatPhone } from "@/lib/format";
import { fetchSaasList, fetchSaasResource } from "@/lib/server/saas-list";
import type { AdminTenant, AuditLogItem, ProviderAccount, UserListItem, WebhookEvent } from "@/types/configuracao";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccountsTableClient } from "./_components/accounts-table-client";
import { AuditTable } from "./_components/audit-table";
import { OmniForm } from "./_components/omni-form";
import { TenantEditForm } from "./_components/tenant-edit-form";
import { UsuarioEditButton } from "./_components/usuario-edit-button";
import { UsuarioForm } from "./_components/usuario-form";
import { WebhookEventsTable } from "./_components/webhook-events-table";
import { ZapiForm } from "./_components/zapi-form";

export const metadata: Metadata = { title: "Cliente" };

type Props = { params: Promise<{ id: string }> };

const ADMIN = { skipTenantHeader: true } as const;

export default async function ClientePage({ params }: Props) {
  const { id } = await params;
  const base = `${SAAS.adminTenants}/${encodeURIComponent(id)}`;
  const tenant = await fetchSaasResource<AdminTenant>(base, ADMIN);
  if (tenant.status === "not_found") notFound();
  if (tenant.status !== "ok") {
    return (
      <>
        <Breadcrumb pageName="Cliente" parent={{ name: "Clientes", href: "/admin/clientes" }} />
        {tenant.status === "unconfigured" ? <CadastroListUnconfigured /> : <CadastroListError message={tenant.message} />}
      </>
    );
  }

  const [users, accounts, events, audit] = await Promise.all([
    fetchSaasList<UserListItem>(`${base}/users`, ADMIN),
    fetchSaasList<ProviderAccount>(`${base}/provider-accounts`, ADMIN),
    fetchSaasList<WebhookEvent>(`${base}/webhook-events?limit=30`, ADMIN),
    fetchSaasList<AuditLogItem>(`${base}/audit-logs`, ADMIN),
  ]);
  const t = tenant.data;

  return (
    <>
      <Breadcrumb pageName={t.tradeName || t.name} parent={{ name: "Clientes", href: "/admin/clientes" }} />
      <div className="mb-6">
        <BackToListingLink href="/admin/clientes" />
      </div>

      <nav className="mb-6 flex flex-wrap gap-2 text-sm font-medium" aria-label="Seções do cliente">
        {[
          ["#dados", "Dados"],
          ["#corretores", `Corretores (${users.data.length})`],
          ["#conexoes", `Conexões WhatsApp (${accounts.data.length})`],
          ["#webhooks", "Webhooks recebidos"],
          ["#auditoria", "Auditoria"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="rounded-full border border-stroke px-4 py-1.5 hover:border-primary dark:border-dark-3">
            {label}
          </a>
        ))}
      </nav>

      <div className="space-y-6">
        <section id="dados" className="scroll-mt-24">
          <TenantEditForm tenant={t} />
        </section>

        <section id="corretores" className="scroll-mt-24 space-y-6">
          <ListCard title="Corretores">
            <CadastroListAlert result={users} />
            <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow className={TABLE_HEADER_ROW_CLASS}>
                    <TableHead className="xl:pl-7.5">Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>WhatsApp autorizado</TableHead>
                    <TableHead>Acesso</TableHead>
                    <TableHead className="text-right xl:pr-7.5">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.data.map((u) => (
                    <TableRow key={u.id} className="border-[#eee] dark:border-dark-3">
                      <TableCell className="font-medium text-dark dark:text-white xl:pl-7.5">{u.name}</TableCell>
                      <TableCell className="text-body-sm text-dark dark:text-white">{u.email}</TableCell>
                      <TableCell className="text-body-sm text-dark dark:text-white">{u.phoneE164 ? formatPhone(u.phoneE164) : "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={u.status} />
                      </TableCell>
                      <TableCell className="text-right xl:pr-7.5">
                        <UsuarioEditButton tenantId={t.id} user={u} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ListCard>
          <UsuarioForm tenantId={t.id} />
        </section>

        <section id="conexoes" className="scroll-mt-24 space-y-6">
          <ListCard title="Conexões WhatsApp">
            <CadastroListAlert result={accounts} />
            <p className="mb-4 text-body-sm text-dark-6">
              Número usado para receber os imóveis dos corretores e enviar as campanhas. Mantenha uma conexão ativa por número: duas
              conexões no mesmo número recebem a mesma mensagem em dobro.
            </p>
            <AccountsTableClient tenantId={t.id} rows={accounts.data} />
          </ListCard>
          <OmniForm tenantId={t.id} />
          <ZapiForm tenantId={t.id} />
        </section>

        <section id="webhooks" className="scroll-mt-24">
          <ListCard title="Últimos webhooks recebidos">
            <CadastroListAlert result={events} />
            <WebhookEventsTable rows={events.data} />
          </ListCard>
        </section>

        <section id="auditoria" className="scroll-mt-24">
          <ListCard title="Auditoria">
            <CadastroListAlert result={audit} />
            <AuditTable rows={audit.data} />
          </ListCard>
        </section>
      </div>
    </>
  );
}
