"use client";

import { FormFeedback, PRIMARY_BUTTON_CLASS } from "@/components/cadastros/form-feedback";
import { SelectField } from "@/components/FormElements/controlled-fields";
import InputGroup from "@/components/FormElements/InputGroup";
import { ShowcaseSection } from "@/components/Layouts/showcase-section";
import { createOmniAccount } from "@/services/admin.service";
import type { InboundMode } from "@/types/configuracao";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

type FormValues = {
  channelId: string;
  secretKey: string;
  inboundMode: InboundMode;
  inboundChatId: string;
};

const MODES = [
  { value: "direct", label: "Mensagem direta (recomendado)" },
  { value: "group", label: "Grupo privado" },
] as const;

/**
 * Canal da Omni Z-API. Diferente da Z-API clássica, não há URL para copiar: ao salvar, a API cria
 * na Omni o webhook assinado (formato Z-API) apontando para ela.
 */
export function OmniForm({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [done, setDone] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: { channelId: "", secretKey: "", inboundMode: "direct", inboundChatId: "" } });
  const mode = watch("inboundMode");

  const onSubmit = handleSubmit(async (v) => {
    if (v.inboundMode === "group" && !v.inboundChatId.trim()) {
      setError("inboundChatId", { message: "Informe o id do grupo." });
      return;
    }
    try {
      const created = await createOmniAccount(tenantId, {
        provider: "omni",
        channelId: v.channelId.trim(),
        secretKey: v.secretKey.trim(),
        inboundMode: v.inboundMode,
        inboundChatId: v.inboundChatId.trim() || undefined,
      });
      setDone(created.note);
      reset();
      router.refresh();
    } catch (e) {
      setError("root", { message: e instanceof Error ? e.message : "Não foi possível salvar a integração." });
    }
  });

  return (
    <ShowcaseSection title="Conectar Omni Z-API">
      {done && (
        <FormFeedback variant="success" className="mb-6">
          {done}
        </FormFeedback>
      )}
      <form onSubmit={onSubmit} noValidate className="space-y-5.5">
        <div className="grid gap-5.5 md:grid-cols-2">
          <Controller
            name="channelId"
            control={control}
            rules={{ required: "Informe o Channel ID." }}
            render={({ field }) => (
              <InputGroup label="Channel ID" type="text" required placeholder="01A1824DEEE3…" value={field.value} handleChange={field.onChange} name={field.name} />
            )}
          />
          <Controller
            name="secretKey"
            control={control}
            rules={{ required: "Informe a Secret Key." }}
            render={({ field }) => (
              <InputGroup label="Secret Key (sk_live_…)" type="password" required value={field.value} handleChange={field.onChange} name={field.name} />
            )}
          />
          <Controller
            name="inboundMode"
            control={control}
            render={({ field }) => (
              <SelectField label="Canal de entrada" value={field.value} onChange={(v) => field.onChange((v || "direct") as InboundMode)} items={MODES} allowEmpty={false} />
            )}
          />
          {mode === "group" && (
            <div>
              <Controller
                name="inboundChatId"
                control={control}
                render={({ field }) => (
                  <InputGroup label="ID do grupo de entrada" type="text" value={field.value} handleChange={field.onChange} name={field.name} />
                )}
              />
              {errors.inboundChatId && <p className="mt-2 text-body-xs text-red">{errors.inboundChatId.message}</p>}
            </div>
          )}
        </div>

        {(errors.channelId || errors.secretKey) && (
          <FormFeedback variant="error">{errors.channelId?.message ?? errors.secretKey?.message}</FormFeedback>
        )}
        {errors.root && <FormFeedback variant="error">{errors.root.message}</FormFeedback>}

        <p className="text-body-xs text-dark-6">
          Use a Secret Key do menu Segurança da Omni (não o token do canal). Ao salvar, o webhook com assinatura é criado na Omni
          automaticamente — a API precisa estar com uma URL pública acessível pela internet. Credenciais ficam cifradas no cofre e
          nunca voltam para o navegador.
        </p>

        <button type="submit" disabled={isSubmitting} className={PRIMARY_BUTTON_CLASS}>
          {isSubmitting ? "Conectando…" : "Salvar integração"}
        </button>
      </form>
    </ShowcaseSection>
  );
}
