"use client";

import { FormFeedback, PRIMARY_BUTTON_CLASS } from "@/components/cadastros/form-feedback";
import { ShowcaseSection } from "@/components/Layouts/showcase-section";
import { importContactsCsv } from "@/services/contatos.service";
import type { ImportReport } from "@/types/contato";
import { useState } from "react";

const EXAMPLE = `name;phone;tags;property_types;neighborhoods;price_max;bedrooms_min;consent;consent_source;consent_evidence
Maria Silva;11988887777;vip;apartamento|casa;Centro;600000;2;sim;formulario do site;lead#1023
João Souza;11977776666;;terreno;;;;;;`;

export function ImportarClient() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      setReport(await importContactsCsv(file.name, await file.text()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na importação.");
    } finally {
      setBusy(false);
    }
  };

  const stats: [string, number][] = report
    ? [
        ["Linhas lidas", report.total],
        ["Criados", report.created],
        ["Atualizados", report.updated],
        ["Consentimentos registrados", report.consentsRecorded],
        ["Descadastrados (não reativados)", report.skippedSuppressedConsent],
        ["Linhas com problema", report.invalid.length],
      ]
    : [];

  return (
    <div className="space-y-6">
      <ShowcaseSection title="Arquivo CSV">
        <div className="space-y-5">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full cursor-pointer rounded-lg border-[1.5px] border-stroke bg-transparent outline-none transition file:mr-5 file:border-collapse file:cursor-pointer file:border-0 file:border-r file:border-solid file:border-stroke file:bg-[#E2E8F0] file:px-6.5 file:py-[13px] file:text-body-sm file:font-medium file:text-dark-5 focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:file:border-dark-3 dark:file:bg-white/30 dark:file:text-white"
          />
          <button type="button" className={PRIMARY_BUTTON_CLASS} disabled={!file || busy} onClick={() => void submit()}>
            {busy ? "Importando…" : "Importar contatos"}
          </button>
          {error && <FormFeedback variant="error">{error}</FormFeedback>}
        </div>
      </ShowcaseSection>

      {report && (
        <ShowcaseSection title="Resultado">
          <dl className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            {stats.map(([label, value]) => (
              <div key={label} className="rounded-lg bg-gray-2 px-4 py-3 dark:bg-dark-2">
                <dt className="text-body-xs text-dark-6">{label}</dt>
                <dd className="mt-1 text-lg font-bold text-dark dark:text-white">{value}</dd>
              </div>
            ))}
          </dl>
          {report.invalid.length > 0 && (
            <ul className="mt-5 space-y-1 text-body-sm text-red">
              {report.invalid.slice(0, 50).map((i) => (
                <li key={`${i.line}-${i.reason}`}>
                  Linha {i.line}: {i.reason}
                </li>
              ))}
            </ul>
          )}
        </ShowcaseSection>
      )}

      <ShowcaseSection title="Formato">
        <p className="mb-4 text-body-sm text-dark-4 dark:text-dark-6">
          Separador vírgula ou ponto-e-vírgula. Listas usam <code>|</code>. Colunas aceitas: name, phone, tags, property_types, cities,
          neighborhoods, price_min, price_max, bedrooms_min, investor, consent, consent_source, consent_date, consent_evidence.
        </p>
        <FormFeedback variant="info" className="mb-4">
          Importar <b>não</b> autoriza envios. O consentimento só é registrado quando a linha traz <code>consent=sim</code> com origem e
          evidência. Números que já pediram descadastro nunca são reativados pela importação.
        </FormFeedback>
        <pre className="overflow-x-auto rounded-lg bg-gray-2 p-4 text-body-xs text-dark dark:bg-dark-2 dark:text-white">{EXAMPLE}</pre>
      </ShowcaseSection>
    </div>
  );
}
