"use client";

import { FormFeedback } from "@/components/cadastros/form-feedback";
import { ListCard } from "@/components/cadastros/list-card";
import { getEligibleContacts, updateCampaignContacts } from "@/services/campanhas.service";
import type { CampaignDetail, EligibleContact } from "@/types/campanha";
import { useCallback, useEffect, useState } from "react";

const PAGE_SIZE = 50;

type Props = {
  campaign: CampaignDetail;
  onSaved: () => Promise<void> | void;
};

export function CampanhaContatosSelector({ campaign, onSaved }: Props) {
  const [items, setItems] = useState<EligibleContact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ variant: "success" | "error"; text: string } | null>(null);

  const load = useCallback(
    async (p: number, q: string) => {
      setLoading(true);
      try {
        const data = await getEligibleContacts(campaign.id, p, q);
        setItems(data.items);
        setTotal(data.total);
        setPage(p);
        // A seleção salva só é carregada uma vez; depois o estado local manda.
        setSelected((cur) => cur ?? new Set(data.selectedIds));
      } catch (e) {
        setFeedback({ variant: "error", text: e instanceof Error ? e.message : "Não foi possível carregar os contatos." });
      } finally {
        setLoading(false);
      }
    },
    [campaign.id],
  );

  useEffect(() => {
    void load(1, search);
  }, [load, search]);

  const chosen = selected ?? new Set<string>();
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const pageAllChosen = items.length > 0 && items.every((c) => chosen.has(c.id));
  const togglePage = () => {
    const next = new Set(chosen);
    for (const c of items) {
      if (pageAllChosen) next.delete(c.id);
      else next.add(c.id);
    }
    setSelected(next);
  };

  const save = async (ids: string[]) => {
    setSaving(true);
    setFeedback(null);
    try {
      await updateCampaignContacts(campaign.id, ids);
      if (ids.length === 0) setSelected(new Set());
      setFeedback({
        variant: "success",
        text: ids.length
          ? `Seleção salva: só ${ids.length} contato(s) vão receber esta campanha.`
          : "Seleção limpa: a campanha volta a ir para todos os contatos elegíveis.",
      });
      await onSaved();
    } catch (e) {
      setFeedback({ variant: "error", text: e instanceof Error ? e.message : "Não foi possível salvar a seleção." });
    } finally {
      setSaving(false);
    }
  };

  const busy = loading || saving;

  return (
    <ListCard title="Quem recebe esta campanha">
      <div className="space-y-4">
        <p className="text-body-sm text-dark-5 dark:text-dark-6">
          Marque os contatos que devem receber este imóvel. Aparecem só contatos ativos, com consentimento e que não pediram
          para sair. <strong className="text-dark dark:text-white">Sem nenhum marcado, a campanha vai para todos os contatos elegíveis.</strong>
        </p>

        {feedback && <FormFeedback variant={feedback.variant}>{feedback.text}</FormFeedback>}

        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(query);
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou telefone"
            className="min-w-0 flex-1 rounded-lg border border-stroke bg-transparent px-4 py-2.5 text-sm outline-none focus:border-primary dark:border-dark-3"
          />
          <button type="submit" className="rounded-lg border border-stroke px-4 py-2.5 text-sm font-medium dark:border-dark-3">
            Buscar
          </button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3 text-body-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={pageAllChosen} onChange={togglePage} disabled={busy || items.length === 0} className="size-4" />
            Marcar todos desta página
          </label>
          <span className="text-dark-6">
            {chosen.size} selecionado(s) · {total} disponível(is)
          </span>
        </div>

        <div className="max-h-96 divide-y divide-stroke overflow-y-auto rounded-lg border border-stroke dark:divide-dark-3 dark:border-dark-3">
          {items.length === 0 && (
            <p className="p-4 text-body-sm text-dark-6">
              {loading ? "Carregando…" : search ? "Nenhum contato encontrado." : "Nenhum contato com consentimento disponível."}
            </p>
          )}
          {items.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-3 px-4 py-3">
              <input type="checkbox" checked={chosen.has(c.id)} onChange={() => toggle(c.id)} disabled={busy} className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-sm font-medium text-dark dark:text-white">{c.name}</span>
                <span className="block text-body-xs text-dark-6">{c.phoneE164}</span>
              </span>
              {c.matchesProperty && (
                <span className="shrink-0 rounded-full bg-neon/15 px-2.5 py-1 text-[11px] font-semibold text-dark dark:text-neon">
                  Perfil compatível
                </span>
              )}
            </label>
          ))}
        </div>

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-center gap-3 text-sm">
            <button type="button" onClick={() => void load(page - 1, search)} disabled={page === 1 || busy} className="disabled:opacity-40">
              ← Anterior
            </button>
            <span>
              {page} de {Math.ceil(total / PAGE_SIZE)}
            </span>
            <button type="button" onClick={() => void load(page + 1, search)} disabled={page * PAGE_SIZE >= total || busy} className="disabled:opacity-40">
              Próxima →
            </button>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => void save([])}
            disabled={busy || chosen.size === 0}
            className="rounded-lg border border-stroke px-4 py-2.5 text-sm font-medium disabled:opacity-40 dark:border-dark-3"
          >
            Limpar seleção
          </button>
          <button
            type="button"
            onClick={() => void save([...chosen])}
            disabled={busy || chosen.size === 0}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {saving ? "Salvando…" : `Salvar seleção (${chosen.size})`}
          </button>
        </div>
      </div>
    </ListCard>
  );
}
