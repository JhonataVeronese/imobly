"use client";
import { EmailIcon, PasswordIcon } from "@/assets/icons";
import { useRouter } from "next/navigation";
import React from "react";
import { Controller, useForm } from "react-hook-form";
import InputGroup from "../FormElements/InputGroup";

type SignInFormValues = {
  email: string;
  password: string;
};

export default function SigninWithPassword() {
  const router = useRouter();

  const {
    control,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<SignInFormValues>({
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    clearErrors("root");
    try {
      const payload: Record<string, unknown> = {
        email: data.email.trim(),
        senha: data.password.trim(),
      };

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        isSuper?: boolean;
      };

      if (!res.ok) {
        setError("root", {
          message: json.error ?? "Não foi possível entrar.",
        });
        return;
      }

      router.push(json.isSuper ? "/admin/clientes" : "/painel");
      router.refresh();
    } catch {
      setError("root", { message: "Erro de rede. Tente novamente." });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <Controller
        name="email"
        control={control}
        rules={{
          required: "Informe o e-mail.",
          pattern: {
            value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            message: "E-mail inválido.",
          },
        }}
        render={({ field }) => (
          <InputGroup
            type="email"
            label="E-mail"
            className="mb-4 [&_input]:py-[15px]"
            placeholder="corretor@imobiliaria.com.br"
            name={field.name}
            handleChange={(e) => {
              field.onChange(e);
              clearErrors("root");
            }}
            value={field.value}
            icon={<EmailIcon />}
          />
        )}
      />
      {errors.email && (
        <p className="mb-4 text-body-xs text-red">{errors.email.message}</p>
      )}

      <Controller
        name="password"
        control={control}
        rules={{ required: "Informe a senha." }}
        render={({ field }) => (
          <InputGroup
            type="password"
            label="Senha"
            className="mb-4 [&_input]:py-[15px]"
            placeholder="••••••••"
            name={field.name}
            handleChange={(e) => {
              field.onChange(e);
              clearErrors("root");
            }}
            value={field.value}
            icon={<PasswordIcon />}
          />
        )}
      />
      {errors.password && (
        <p className="mb-4 text-body-xs text-red">{errors.password.message}</p>
      )}

      {errors.root && (
        <p className="mb-4 rounded-lg border border-red/30 bg-red/10 px-4 py-3 text-sm text-red dark:bg-red/15">
          {errors.root.message}
        </p>
      )}

      <div className="mb-4.5">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary p-4 font-semibold text-primary-foreground transition hover:bg-opacity-90 disabled:opacity-70"
        >
          Entrar
          {isSubmitting && (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-primary-foreground border-t-transparent" />
          )}
        </button>
      </div>
    </form>
  );
}
