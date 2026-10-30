"use client";

import { FormFeedback, PRIMARY_BUTTON_CLASS } from "@/components/cadastros/form-feedback";
import { SelectField } from "@/components/FormElements/controlled-fields";
import InputGroup from "@/components/FormElements/InputGroup";
import { ShowcaseSection } from "@/components/Layouts/showcase-section";
import { formatPhone } from "@/lib/format";
import { updateTenant } from "@/services/admin.service";
import type { AdminTenant, TenantStatus } from "@/types/configuracao";
import { useRouter } from "next/navigation";
import { useState } from "react";

const STATUS = [
  { value: "active", label: "Ativo" },
  { value: "suspended", label: "Suspenso (ninguém do cliente entra no painel)" },
] as const;

export function TenantEditForm({ tenant }: { tenant: AdminTenant }) {
  const router = useRouter();
  const [name, setName] = useState(tenant.name);
  const [tradeName, setTradeName] = useState(tenant.tradeName ?? "");
  const [phone, setPhone] = useState(tenant.contactPhone ? formatPhone(tenant.contactPhone) : "");
  const [limit, setLimit] = useState(String(tenant.monthlyMessageLimit));
  const [status, setStatus] = useState<TenantStatus>(tenant.status);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ variant: "success" | "error"; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const monthlyMessageLimit = Number(limit);
    if (name.trim().length < 2) return setFeedback({ variant: "error", text: "Informe o nome do cliente." });
    if (!Number.isInteger(monthlyMessageLimit) || monthlyMessageLimit < 0) {
      return setFeedback({ variant: "error", text: "Limite mensal deve ser um número inteiro." });
    }
    setBusy(true);
    setFeedback(null);
    try {
      await updateTenant(tenant.id, {
        name: name.trim(),
        tradeName: tradeName.trim() || null,
        contactPhone: phone.trim() || null,
        monthlyMessageLimit,
        status,
      });
      setFeedback({ variant: "success", text: "Dados salvos." });
      router.refresh();
    } catch (err) {
      setFeedback({ variant: "error", text: err instanceof Error ? err.message : "Não foi possível salvar." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ShowcaseSection title="Dados do cliente">
      <form onSubmit={(e) => void submit(e)} noValidate className="space-y-5.5">
        <div className="grid gap-5.5 md:grid-cols-2">
          <InputGroup label="Razão social / nome" type="text" required value={name} handleChange={(e) => setName(e.target.value)} />
          <InputGroup label="Nome fantasia" type="text" value={tradeName} handleChange={(e) => setTradeName(e.target.value)} />
          <InputGroup label="Telefone de contato" type="text" value={phone} handleChange={(e) => setPhone(e.target.value)} />
          <InputGroup label="Limite de mensagens por mês" type="number" value={limit} handleChange={(e) => setLimit(e.target.value)} />
          <SelectField
            label="Situação"
            value={status}
            onChange={(v) => setStatus(v === "suspended" ? "suspended" : "active")}
            items={STATUS}
            allowEmpty={false}
          />
        </div>
        {feedback && <FormFeedback variant={feedback.variant}>{feedback.text}</FormFeedback>}
        <button type="submit" disabled={busy} className={PRIMARY_BUTTON_CLASS}>
          {busy ? "Salvando…" : "Salvar dados"}
        </button>
      </form>
    </ShowcaseSection>
  );
}
