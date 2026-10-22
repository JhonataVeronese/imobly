"use client";

import { FormFeedback, PRIMARY_BUTTON_CLASS } from "@/components/cadastros/form-feedback";
import { SelectField } from "@/components/FormElements/controlled-fields";
import InputGroup from "@/components/FormElements/InputGroup";
import { ShowcaseSection } from "@/components/Layouts/showcase-section";
import { createZapiAccount } from "@/services/configuracoes.service";
import type { InboundMode } from "@/types/configuracao";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { WebhookUrlNotice } from "./webhook-url-notice";

type FormValues = {
  instanceId: string;
  instanceToken: string;
  clientToken: string;
  inboundMode: InboundMode;
  inboundChatId: string;
};

const MODES = [
  { value: "group", label: "Grupo privado" },
  { value: "direct", label: "Mensagem direta" },
] as const;

export function ZapiForm() {
  const router = useRouter();
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { instanceId: "", instanceToken: "", clientToken: "", inboundMode: "group", inboundChatId: "" },
  });
  const mode = watch("inboundMode");

  const onSubmit = handleSubmit(async (v) => {
    if (v.inboundMode === "group" && !v.inboundChatId.trim()) {
      setError("inboundChatId", { message: "Informe o id do grupo (termina em -group)." });
      return;
    }
    try {
      const created = await createZapiAccount({
        provider: "zapi",
        instanceId: v.instanceId.trim(),
        instanceToken: v.instanceToken.trim(),
        clientToken: v.clientToken.trim() || undefined,
        inboundMode: v.inboundMode,
        inboundChatId: v.inboundChatId.trim() || undefined,
      });
      setWebhookUrl(created.webhookUrl);
      reset();
      router.refresh();
    } catch (e) {
      setError("root", { message: e instanceof Error ? e.message : "Não foi possível salvar a integração." });
    }
  });

  return (
    <ShowcaseSection title="Conectar Z-API">
      {webhookUrl && <WebhookUrlNotice url={webhookUrl} onClose={() => setWebhookUrl(null)} />}
      <form onSubmit={onSubmit} noValidate className="space-y-5.5">
        <div className="grid gap-5.5 md:grid-cols-2">
          <Controller
            name="instanceId"
            control={control}
            rules={{ required: "Informe o Instance ID." }}
            render={({ field }) => <InputGroup label="Instance ID" type="text" required value={field.value} handleChange={field.onChange} name={field.name} />}
          />
          <Controller
            name="instanceToken"
            control={control}
            rules={{ required: "Informe o token da instância." }}
            render={({ field }) => (
              <InputGroup label="Token da instância" type="password" required value={field.value} handleChange={field.onChange} name={field.name} />
            )}
          />
          <Controller
            name="clientToken"
            control={control}
            render={({ field }) => (
              <InputGroup label="Client-Token (opcional)" type="password" value={field.value} handleChange={field.onChange} name={field.name} />
            )}
          />
          <Controller
            name="inboundMode"
            control={control}
            render={({ field }) => (
              <SelectField label="Canal de entrada" value={field.value} onChange={(v) => field.onChange((v || "group") as InboundMode)} items={MODES} allowEmpty={false} />
            )}
          />
          {mode === "group" && (
            <div>
              <Controller
                name="inboundChatId"
                control={control}
                render={({ field }) => (
                  <InputGroup label="ID do grupo de entrada" type="text" placeholder="120363...-group" value={field.value} handleChange={field.onChange} name={field.name} />
                )}
              />
              {errors.inboundChatId && <p className="mt-2 text-body-xs text-red">{errors.inboundChatId.message}</p>}
            </div>
          )}
        </div>

        {(errors.instanceId || errors.instanceToken) && (
          <FormFeedback variant="error">{errors.instanceId?.message ?? errors.instanceToken?.message}</FormFeedback>
        )}
        {errors.root && <FormFeedback variant="error">{errors.root.message}</FormFeedback>}

        <p className="text-body-xs text-dark-6">
          As credenciais vão direto para o cofre da API (AES-256-GCM) e nunca voltam para o navegador. Valide o fluxo de grupo na Fase 0
          antes de usar em produção — se o provedor não identificar o remetente, use mensagem direta.
        </p>

        <button type="submit" disabled={isSubmitting} className={PRIMARY_BUTTON_CLASS}>
          {isSubmitting ? "Salvando…" : "Salvar integração"}
        </button>
      </form>
    </ShowcaseSection>
  );
}
