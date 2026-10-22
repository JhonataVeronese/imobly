"use client";

import { FormFeedback, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/components/cadastros/form-feedback";
import InputGroup from "@/components/FormElements/InputGroup";
import { FormDialog } from "@/components/ui/form-dialog";
import { registerConsent } from "@/services/contatos.service";
import type { ContactListItem } from "@/types/contato";
import { useState } from "react";

type Props = {
  contact: ContactListItem | null;
  canReactivate: boolean;
  onClose: () => void;
  onSaved: () => void;
};

/**
 * Registro de consentimento verificável: origem + evidência são obrigatórias.
 * Reativar um número descadastrado exige perfil administrador e confirmação explícita.
 */
export function ConsentDialog({ contact, canReactivate, onClose, onSaved }: Props) {
  const [source, setSource] = useState("");
  const [evidence, setEvidence] = useState("");
  const [confirmReactivation, setConfirmReactivation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOptedOut = contact?.status === "opted_out";
  const blocked = isOptedOut && !canReactivate;

  const close = () => {
    setSource("");
    setEvidence("");
    setConfirmReactivation(false);
    setError(null);
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact) return;
    if (source.trim().length < 2 || evidence.trim().length < 2) {
      setError("Informe a origem e a evidência do consentimento.");
      return;
    }
    if (isOptedOut && !confirmReactivation) {
      setError("Confirme a reativação do número descadastrado.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await registerConsent(contact.id, {
        source: source.trim(),
        evidenceReference: evidence.trim(),
        overrideSuppression: isOptedOut ? true : undefined,
      });
      close();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível registrar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDialog
      open={contact !== null}
      onClose={close}
      busy={busy}
      title={isOptedOut ? "Reativar contato descadastrado" : "Registrar consentimento"}
      description={
        contact
          ? `${contact.name} — o contato só passa a receber campanhas com uma autorização verificável. Estar na agenda ou em um grupo não é consentimento.`
          : undefined
      }
    >
      {blocked ? (
        <FormFeedback variant="error">Somente administradores podem reativar números que pediram descadastro.</FormFeedback>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="space-y-5">
          <InputGroup
            label="Origem"
            type="text"
            required
            placeholder="Formulário do site, atendimento presencial…"
            value={source}
            handleChange={(e) => setSource(e.target.value)}
          />
          <InputGroup
            label="Evidência"
            type="text"
            required
            placeholder="ID do lead, protocolo, link do registro…"
            value={evidence}
            handleChange={(e) => setEvidence(e.target.value)}
          />
          {isOptedOut && (
            <label className="flex items-start gap-3 text-body-sm text-dark dark:text-white">
              <input type="checkbox" className="mt-1" checked={confirmReactivation} onChange={(e) => setConfirmReactivation(e.target.checked)} />
              Confirmo que este número autorizou novamente o recebimento, com a evidência acima.
            </label>
          )}
          {error && <FormFeedback variant="error">{error}</FormFeedback>}
          <div className="flex justify-end gap-3">
            <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={close} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={busy}>
              {busy ? "Salvando…" : "Registrar"}
            </button>
          </div>
        </form>
      )}
    </FormDialog>
  );
}
