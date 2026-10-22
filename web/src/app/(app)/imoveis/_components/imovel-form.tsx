"use client";

import { FormFeedback, PRIMARY_BUTTON_CLASS } from "@/components/cadastros/form-feedback";
import { SelectField, TextAreaField } from "@/components/FormElements/controlled-fields";
import InputGroup from "@/components/FormElements/InputGroup";
import { ShowcaseSection } from "@/components/Layouts/showcase-section";
import { numberOrNull, textOrNull } from "@/lib/format";
import { createProperty, updateProperty } from "@/services/imoveis.service";
import { PROPERTY_TYPES, type PropertyListItem, type PropertyPayload } from "@/types/imovel";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

type FormValues = {
  title: string;
  propertyType: string;
  transaction: string;
  price: string;
  city: string;
  neighborhood: string;
  bedrooms: string;
  suites: string;
  bathrooms: string;
  parkingSpaces: string;
  areaM2: string;
  description: string;
};

const NUMBER_FIELDS = [
  ["price", "Preço (R$)"],
  ["areaM2", "Área (m²)"],
  ["bedrooms", "Quartos"],
  ["suites", "Suítes"],
  ["bathrooms", "Banheiros"],
  ["parkingSpaces", "Vagas"],
] as const;

const TRANSACTIONS = [
  { value: "venda", label: "Venda" },
  { value: "aluguel", label: "Aluguel" },
] as const;

/** Número da API → texto no formato pt-BR do formulário ("85.5" → "85,5"), lido de volta por `numberOrNull`. */
const str = (v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? String(n).replace(".", ",") : "";
};

function toFormValues(p?: PropertyListItem): FormValues {
  return {
    title: p?.title ?? "",
    propertyType: p?.propertyType ?? "",
    transaction: p?.transaction ?? "",
    price: str(p?.price),
    city: p?.city ?? "",
    neighborhood: p?.neighborhood ?? "",
    bedrooms: str(p?.bedrooms),
    suites: str(p?.suites),
    bathrooms: str(p?.bathrooms),
    parkingSpaces: str(p?.parkingSpaces),
    areaM2: str(p?.areaM2),
    description: p?.description ?? "",
  };
}

function toPayload(v: FormValues): PropertyPayload {
  const int = (raw: string) => {
    const n = numberOrNull(raw);
    return n === null ? null : Math.trunc(n);
  };
  return {
    title: textOrNull(v.title),
    description: textOrNull(v.description),
    propertyType: textOrNull(v.propertyType),
    transaction: v.transaction === "venda" || v.transaction === "aluguel" ? v.transaction : null,
    price: numberOrNull(v.price),
    city: textOrNull(v.city),
    neighborhood: textOrNull(v.neighborhood),
    bedrooms: int(v.bedrooms),
    suites: int(v.suites),
    bathrooms: int(v.bathrooms),
    parkingSpaces: int(v.parkingSpaces),
    areaM2: numberOrNull(v.areaM2),
  };
}

export function ImovelForm({ property }: { property?: PropertyListItem }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: toFormValues(property) });

  const onSubmit = handleSubmit(async (values) => {
    setSaved(false);
    const payload = toPayload(values);
    if (!payload.title && !payload.description) {
      setError("root", { message: "Informe ao menos o título ou a descrição do imóvel." });
      return;
    }
    try {
      if (property) {
        await updateProperty(property.id, payload);
        setSaved(true);
        router.refresh();
      } else {
        const created = await createProperty(payload);
        router.push(`/imoveis/${created.id}/editar`);
      }
    } catch (e) {
      setError("root", { message: e instanceof Error ? e.message : "Não foi possível salvar." });
    }
  });

  return (
    <ShowcaseSection title={property ? "Dados do imóvel" : "Novo imóvel"}>
      <form onSubmit={onSubmit} noValidate className="space-y-5.5">
        <div className="grid gap-5.5 md:grid-cols-2">
          <Controller
            name="title"
            control={control}
            render={({ field }) => (
              <InputGroup label="Título" type="text" placeholder="Apartamento à venda no Centro" value={field.value} handleChange={field.onChange} name={field.name} />
            )}
          />
          <div className="grid gap-5.5 sm:grid-cols-2">
            <Controller
              name="propertyType"
              control={control}
              render={({ field }) => <SelectField label="Tipo" value={field.value} onChange={field.onChange} items={PROPERTY_TYPES} />}
            />
            <Controller
              name="transaction"
              control={control}
              render={({ field }) => <SelectField label="Negócio" value={field.value} onChange={field.onChange} items={TRANSACTIONS} />}
            />
          </div>
        </div>

        <div className="grid gap-5.5 md:grid-cols-2">
          <Controller
            name="neighborhood"
            control={control}
            render={({ field }) => <InputGroup label="Bairro" type="text" value={field.value} handleChange={field.onChange} name={field.name} />}
          />
          <Controller
            name="city"
            control={control}
            render={({ field }) => <InputGroup label="Cidade" type="text" value={field.value} handleChange={field.onChange} name={field.name} />}
          />
        </div>

        <div className="grid grid-cols-2 gap-5.5 md:grid-cols-3 xl:grid-cols-6">
          {NUMBER_FIELDS.map(([name, label]) => (
            <Controller
              key={name}
              name={name}
              control={control}
              render={({ field }) => (
                <InputGroup label={label} type="text" placeholder="—" value={field.value} handleChange={field.onChange} name={field.name} />
              )}
            />
          ))}
        </div>

        <Controller
          name="description"
          control={control}
          render={({ field }) => (
            <TextAreaField
              label="Descrição (texto da divulgação)"
              value={field.value}
              onChange={field.onChange}
              rows={8}
              hint="É o texto que vai na variável {{descricao}} da mensagem. Campos vazios ficam sem valor — o sistema não inventa dados."
            />
          )}
        />

        {errors.root && <FormFeedback variant="error">{errors.root.message}</FormFeedback>}
        {saved && <FormFeedback variant="success">Imóvel atualizado. A estimativa de público das campanhas pendentes foi recalculada.</FormFeedback>}

        <button type="submit" disabled={isSubmitting} className={PRIMARY_BUTTON_CLASS}>
          {isSubmitting ? "Salvando…" : property ? "Salvar correções" : "Cadastrar e adicionar arquivos"}
        </button>
      </form>
    </ShowcaseSection>
  );
}
