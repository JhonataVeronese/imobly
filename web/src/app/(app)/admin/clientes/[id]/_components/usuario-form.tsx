"use client";

import { FormFeedback, PRIMARY_BUTTON_CLASS } from "@/components/cadastros/form-feedback";
import InputGroup from "@/components/FormElements/InputGroup";
import { ShowcaseSection } from "@/components/Layouts/showcase-section";
import { createUser } from "@/services/admin.service";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

type FormValues = { name: string; email: string; password: string; phone: string };

const FIELDS = [
  ["name", "Nome", "text", { required: "Informe o nome." }],
  ["email", "E-mail", "email", { required: "Informe o e-mail." }],
  ["password", "Senha inicial", "password", { required: "Informe a senha.", minLength: { value: 8, message: "Mínimo de 8 caracteres." } }],
  ["phone", "WhatsApp (remetente autorizado)", "text", {}],
] as const;

export function UsuarioForm({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [created, setCreated] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: { name: "", email: "", password: "", phone: "" } });

  const onSubmit = handleSubmit(async (v) => {
    setCreated(null);
    try {
      const user = await createUser(tenantId, { name: v.name.trim(), email: v.email.trim(), password: v.password, phone: v.phone.trim() || undefined });
      setCreated(user.name);
      reset();
      router.refresh();
    } catch (e) {
      setError("root", { message: e instanceof Error ? e.message : "Não foi possível criar o corretor." });
    }
  });

  return (
    <ShowcaseSection title="Novo corretor">
      <form onSubmit={onSubmit} noValidate className="space-y-5.5">
        <div className="grid gap-5.5 md:grid-cols-2">
          {FIELDS.map(([name, label, type, rules]) => (
            <div key={name}>
              <Controller
                name={name}
                control={control}
                rules={rules}
                render={({ field }) => (
                  <InputGroup label={label} type={type} required={"required" in rules} value={field.value} handleChange={field.onChange} name={field.name} />
                )}
              />
              {errors[name] && <p className="mt-2 text-body-xs text-red">{errors[name]?.message}</p>}
            </div>
          ))}
        </div>
        <p className="text-body-xs text-dark-6">
          O corretor entra no painel com este e-mail e senha. Só quem tem WhatsApp cadastrado pode enviar imóveis e responder CONFIRMAR
          pelo WhatsApp — use um número diferente do que está conectado na conexão do cliente.
        </p>
        {errors.root && <FormFeedback variant="error">{errors.root.message}</FormFeedback>}
        {created && <FormFeedback variant="success">Corretor {created} criado.</FormFeedback>}
        <button type="submit" disabled={isSubmitting} className={PRIMARY_BUTTON_CLASS}>
          {isSubmitting ? "Salvando…" : "Criar corretor"}
        </button>
      </form>
    </ShowcaseSection>
  );
}
