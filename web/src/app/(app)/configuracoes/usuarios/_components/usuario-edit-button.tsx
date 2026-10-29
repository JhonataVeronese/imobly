"use client";

import { FormFeedback, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/components/cadastros/form-feedback";
import InputGroup from "@/components/FormElements/InputGroup";
import { FormDialog } from "@/components/ui/form-dialog";
import { formatPhone } from "@/lib/format";
import { updateUser } from "@/services/configuracoes.service";
import type { UserListItem } from "@/types/configuracao";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function UsuarioEditButton({ user }: { user: UserListItem }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phoneE164 ? formatPhone(user.phoneE164) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openDialog = () => {
    setName(user.name);
    setPhone(user.phoneE164 ? formatPhone(user.phoneE164) : "");
    setError(null);
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError("Informe o nome.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateUser(user.id, { name: name.trim(), phone: phone.trim() || null });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" onClick={openDialog} className="text-body-sm font-medium text-primary hover:underline">
        Editar
      </button>
      <FormDialog
        open={open}
        onClose={() => setOpen(false)}
        busy={busy}
        title="Editar usuário"
        description={`${user.email} — o WhatsApp cadastrado é o remetente autorizado a enviar imóveis e responder CONFIRMAR no canal de entrada.`}
      >
        <form onSubmit={(e) => void submit(e)} className="space-y-5">
          <InputGroup label="Nome" type="text" required value={name} handleChange={(e) => setName(e.target.value)} />
          <InputGroup
            label="WhatsApp (remetente autorizado)"
            type="text"
            placeholder="(45) 99999-9999 — vazio remove"
            value={phone}
            handleChange={(e) => setPhone(e.target.value)}
          />
          <p className="text-body-xs text-dark-6">
            Use um número diferente do que está conectado na integração: mensagens enviadas pelo próprio número conectado são ignoradas.
          </p>
          {error && <FormFeedback variant="error">{error}</FormFeedback>}
          <div className="flex justify-end gap-3">
            <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={() => setOpen(false)} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={busy}>
              {busy ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </FormDialog>
    </>
  );
}
