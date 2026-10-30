"use client";

import { FormFeedback, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/components/cadastros/form-feedback";
import InputGroup from "@/components/FormElements/InputGroup";
import { FormDialog } from "@/components/ui/form-dialog";
import { formatPhone } from "@/lib/format";
import { updateUser } from "@/services/admin.service";
import type { UserListItem } from "@/types/configuracao";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Edita nome e WhatsApp, ativa/desativa o acesso e redefine a senha de um corretor do cliente. */
export function UsuarioEditButton({ tenantId, user }: { tenantId: string; user: UserListItem }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState("");
  const [active, setActive] = useState(user.status === "active");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openDialog = () => {
    setName(user.name);
    setPhone(user.phoneE164 ? formatPhone(user.phoneE164) : "");
    setActive(user.status === "active");
    setPassword("");
    setError(null);
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError("Informe o nome.");
    if (password && password.length < 8) return setError("A nova senha precisa de pelo menos 8 caracteres.");
    setBusy(true);
    setError(null);
    try {
      await updateUser(tenantId, user.id, {
        name: name.trim(),
        phone: phone.trim() || null,
        status: active ? "active" : "disabled",
        ...(password ? { password } : {}),
      });
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
      <FormDialog open={open} onClose={() => setOpen(false)} busy={busy} title="Editar corretor" description={user.email}>
        <form onSubmit={(e) => void submit(e)} className="space-y-5">
          <InputGroup label="Nome" type="text" required value={name} handleChange={(e) => setName(e.target.value)} />
          <InputGroup
            label="WhatsApp (remetente autorizado)"
            type="text"
            placeholder="(45) 99999-9999 — vazio remove"
            value={phone}
            handleChange={(e) => setPhone(e.target.value)}
          />
          <InputGroup
            label="Nova senha (opcional)"
            type="password"
            placeholder="Deixe em branco para manter"
            value={password}
            handleChange={(e) => setPassword(e.target.value)}
          />
          <label className="flex items-center gap-3 text-body-sm text-dark dark:text-white">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4" />
            Acesso ativo (desmarcado: não entra no painel nem é reconhecido no WhatsApp)
          </label>
          <p className="text-body-xs text-dark-6">
            O WhatsApp precisa ser diferente do número conectado na conexão do cliente: mensagens enviadas pelo próprio número conectado são
            ignoradas.
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
