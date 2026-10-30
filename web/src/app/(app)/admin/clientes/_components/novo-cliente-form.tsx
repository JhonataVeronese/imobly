"use client";

import { FormFeedback, PRIMARY_BUTTON_CLASS } from "@/components/cadastros/form-feedback";
import InputGroup from "@/components/FormElements/InputGroup";
import { ShowcaseSection } from "@/components/Layouts/showcase-section";
import { createTenant } from "@/services/admin.service";
import { useRouter } from "next/navigation";
import { useState } from "react";

const EMPTY = { name: "", tradeName: "", contactPhone: "", userName: "", email: "", password: "", phone: "" };

/** Cadastra a imobiliária já com o primeiro corretor (sem ele, ninguém do cliente consegue entrar). */
export function NovoClienteForm() {
  const router = useRouter();
  const [v, setV] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setV((cur) => ({ ...cur, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (v.name.trim().length < 2 || v.userName.trim().length < 2 || !v.email.trim()) {
      return setError("Informe o nome do cliente e o nome e e-mail do primeiro corretor.");
    }
    if (v.password.length < 8) return setError("A senha inicial precisa de pelo menos 8 caracteres.");
    setBusy(true);
    setError(null);
    try {
      const tenant = await createTenant({
        name: v.name.trim(),
        tradeName: v.tradeName.trim() || null,
        contactPhone: v.contactPhone.trim() || null,
        user: { name: v.userName.trim(), email: v.email.trim(), password: v.password, phone: v.phone.trim() || undefined },
      });
      router.push(`/admin/clientes/${tenant.id}#conexoes`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível cadastrar o cliente.");
      setBusy(false);
    }
  };

  return (
    <ShowcaseSection title="Novo cliente">
      <form onSubmit={(e) => void submit(e)} noValidate className="space-y-5.5">
        <p className="rotulo text-dark-5 dark:text-neon">Imobiliária</p>
        <div className="grid gap-5.5 md:grid-cols-3">
          <InputGroup label="Razão social / nome" type="text" required value={v.name} handleChange={set("name")} />
          <InputGroup label="Nome fantasia" type="text" value={v.tradeName} handleChange={set("tradeName")} />
          <InputGroup label="Telefone de contato" type="text" value={v.contactPhone} handleChange={set("contactPhone")} />
        </div>
        <p className="rotulo text-dark-5 dark:text-neon">Primeiro corretor</p>
        <div className="grid gap-5.5 md:grid-cols-2">
          <InputGroup label="Nome" type="text" required value={v.userName} handleChange={set("userName")} />
          <InputGroup label="E-mail (login)" type="email" required value={v.email} handleChange={set("email")} />
          <InputGroup label="Senha inicial" type="password" required value={v.password} handleChange={set("password")} />
          <InputGroup label="WhatsApp (remetente autorizado)" type="text" value={v.phone} handleChange={set("phone")} />
        </div>
        {error && <FormFeedback variant="error">{error}</FormFeedback>}
        <p className="text-body-xs text-dark-6">Depois de salvar, você vai para a página do cliente para conectar o WhatsApp dele.</p>
        <button type="submit" disabled={busy} className={PRIMARY_BUTTON_CLASS}>
          {busy ? "Cadastrando…" : "Cadastrar cliente"}
        </button>
      </form>
    </ShowcaseSection>
  );
}
