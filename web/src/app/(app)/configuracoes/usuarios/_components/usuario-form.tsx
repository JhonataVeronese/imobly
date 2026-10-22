"use client";

import { FormFeedback, PRIMARY_BUTTON_CLASS } from "@/components/cadastros/form-feedback";
import { SelectField } from "@/components/FormElements/controlled-fields";
import InputGroup from "@/components/FormElements/InputGroup";
import { ShowcaseSection } from "@/components/Layouts/showcase-section";
import { createUser } from "@/services/configuracoes.service";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

type FormValues = { name: string; email: string; password: string; role: "admin" | "agent"; phone: string };

const ROLES = [
  { value: "agent", label: "Corretor" },
  { value: "admin", label: "Administrador" },
] as const;

const FIELDS = [
  ["name", "Nome", "text", { required: "Informe o nome." }],
  ["email", "E-mail", "email", { required: "Informe o e-mail." }],
  ["password", "Senha inicial", "password", { required: "Informe a senha.", minLength: { value: 8, message: "Mínimo de 8 caracteres." } }],
  ["phone", "WhatsApp (remetente autorizado)", "text", {}],
] as const;

export function UsuarioForm() {
  const router = useRouter();
  const [created, setCreated] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: { name: "", email: "", password: "", role: "agent", phone: "" } });

  const onSubmit = handleSubmit(async (v) => {
    setCreated(null);
    try {
      const user = await createUser({ ...v, name: v.name.trim(), email: v.email.trim(), phone: v.phone.trim() || undefined });
      setCreated(user.name);
      reset();
      router.refresh();
    } catch (e) {
      setError("root", { message: e instanceof Error ? e.message : "Não foi possível criar o usuário." });
    }
  });

  return (
    <ShowcaseSection title="Novo usuário">
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
          <Controller
            name="role"
            control={control}
            render={({ field }) => (
              <SelectField label="Perfil" value={field.value} onChange={(v) => field.onChange(v === "admin" ? "admin" : "agent")} items={ROLES} allowEmpty={false} />
            )}
          />
        </div>
        <p className="text-body-xs text-dark-6">
          Somente usuários com WhatsApp cadastrado podem enviar imóveis e responder CONFIRMAR no canal de entrada.
        </p>
        {errors.root && <FormFeedback variant="error">{errors.root.message}</FormFeedback>}
        {created && <FormFeedback variant="success">Usuário {created} criado.</FormFeedback>}
        <button type="submit" disabled={isSubmitting} className={PRIMARY_BUTTON_CLASS}>
          {isSubmitting ? "Salvando…" : "Criar usuário"}
        </button>
      </form>
    </ShowcaseSection>
  );
}
