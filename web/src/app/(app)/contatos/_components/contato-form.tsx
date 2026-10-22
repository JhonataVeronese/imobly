"use client";

import { FormFeedback, PRIMARY_BUTTON_CLASS } from "@/components/cadastros/form-feedback";
import InputGroup from "@/components/FormElements/InputGroup";
import { ShowcaseSection } from "@/components/Layouts/showcase-section";
import { numberOrNull } from "@/lib/format";
import { createContact } from "@/services/contatos.service";
import type { ContactPreferences } from "@/types/contato";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";

type FormValues = {
  name: string;
  phone: string;
  tags: string;
  propertyTypes: string;
  neighborhoods: string;
  cities: string;
  priceMax: string;
  bedroomsMin: string;
};

const splitList = (raw: string) =>
  raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

function toPreferences(v: FormValues): ContactPreferences {
  const prefs: ContactPreferences = {};
  const types = splitList(v.propertyTypes).map((t) => t.toLowerCase());
  if (types.length) prefs.propertyTypes = types;
  const neighborhoods = splitList(v.neighborhoods);
  if (neighborhoods.length) prefs.neighborhoods = neighborhoods;
  const cities = splitList(v.cities);
  if (cities.length) prefs.cities = cities;
  const priceMax = numberOrNull(v.priceMax);
  if (priceMax !== null) prefs.priceMax = priceMax;
  const bedroomsMin = numberOrNull(v.bedroomsMin);
  if (bedroomsMin !== null) prefs.bedroomsMin = Math.trunc(bedroomsMin);
  return prefs;
}

const TEXT_FIELDS = [
  ["name", "Nome", "Maria Silva", true],
  ["phone", "WhatsApp", "(11) 98888-7777", true],
  ["tags", "Tags (separadas por vírgula)", "vip, investidor", false],
  ["propertyTypes", "Tipos de interesse", "apartamento, casa", false],
  ["neighborhoods", "Bairros de interesse", "Centro, Cambuí", false],
  ["cities", "Cidades de interesse", "Campinas", false],
  ["priceMax", "Preço máximo (R$)", "600000", false],
  ["bedroomsMin", "Quartos (mínimo)", "2", false],
] as const;

export function ContatoForm() {
  const router = useRouter();
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { name: "", phone: "", tags: "", propertyTypes: "", neighborhoods: "", cities: "", priceMax: "", bedroomsMin: "" },
  });

  const onSubmit = handleSubmit(async (v) => {
    try {
      await createContact({ name: v.name.trim(), phone: v.phone.trim(), tags: splitList(v.tags), preferences: toPreferences(v) });
      router.push("/contatos");
      router.refresh();
    } catch (e) {
      setError("root", { message: e instanceof Error ? e.message : "Não foi possível salvar." });
    }
  });

  return (
    <ShowcaseSection title="Dados do contato">
      <form onSubmit={onSubmit} noValidate className="space-y-5.5">
        <div className="grid gap-5.5 md:grid-cols-2">
          {TEXT_FIELDS.map(([name, label, placeholder, required]) => (
            <div key={name}>
              <Controller
                name={name}
                control={control}
                rules={required ? { required: `Informe ${label.toLowerCase()}.` } : undefined}
                render={({ field }) => (
                  <InputGroup label={label} type="text" required={required} placeholder={placeholder} value={field.value} handleChange={field.onChange} name={field.name} />
                )}
              />
              {errors[name] && <p className="mt-2 text-body-xs text-red">{errors[name]?.message}</p>}
            </div>
          ))}
        </div>

        <FormFeedback variant="info">
          O contato é criado <b>sem consentimento</b>. Registre a autorização na carteira (origem + evidência) antes de incluí-lo em
          campanhas.
        </FormFeedback>
        {errors.root && <FormFeedback variant="error">{errors.root.message}</FormFeedback>}

        <button type="submit" disabled={isSubmitting} className={PRIMARY_BUTTON_CLASS}>
          {isSubmitting ? "Salvando…" : "Cadastrar contato"}
        </button>
      </form>
    </ShowcaseSection>
  );
}
