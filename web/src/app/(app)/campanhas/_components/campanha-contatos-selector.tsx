"use client";

import { ListCard } from "@/components/cadastros/list-card";
import type { CampaignDetail, EligibleContact } from "@/types/campanha";
import { getEligibleContacts, updateCampaignAudience } from "@/services/campanhas.service";
import { useCallback, useEffect, useState } from "react";

interface ContatosSelectorProps {
  campaign: CampaignDetail;
  onUpdate?: (contactIds: string[]) => void;
  disabled?: boolean;
}

export function CampanhaContatosSelector({ campaign, onUpdate, disabled = false }: ContatosSelectorProps) {
  const [page, setPage] = useState(1);
  const [eligibleContacts, setEligibleContacts] = useState<EligibleContact[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Carrega contatos elegíveis da API
  const loadContacts = useCallback(async (pageNum: number) => {
    setLoading(true);
    try {
      const data = await getEligibleContacts(campaign.id, pageNum);
      setEligibleContacts(data.items);
      setTotal(data.total);
      setPage(pageNum);
    } catch (err) {
      console.error("Erro ao carregar contatos:", err);
    } finally {
      setLoading(false);
    }
  }, [campaign.id]);

  useEffect(() => {
    loadContacts(1);
  }, [loadContacts]);

  const toggleContact = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleAll = (select: boolean) => {
    if (select) {
      setSelectedIds(new Set(eligibleContacts.map((c) => c.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const audience = {
        contactIds: Array.from(selectedIds),
      };
      await updateCampaignAudience(campaign.id, audience);
      onUpdate?.(Array.from(selectedIds));
    } catch (err) {
      console.error("Erro ao atualizar campanha:", err);
    } finally {
      setLoading(false);
    }
  };

  const allSelected = eligibleContacts.length > 0 && eligibleContacts.every((c) => selectedIds.has(c.id));
  const someSelected = eligibleContacts.some((c) => selectedIds.has(c.id));

  return (
    <ListCard title="Seleção de Contatos">
      <div className="space-y-4">
        <p className="text-body-sm text-dark-6">
          {total} contato(s) elegível(is) · {selectedIds.size} selecionado(s)
        </p>

        {total === 0 ? (
          <p className="text-body-sm text-dark-4">Nenhum contato com consentimento disponível.</p>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-3">
              <input
                type="checkbox"
                id="select-all"
                checked={allSelected || someSelected}
                onChange={(e) => toggleAll(e.target.checked)}
                disabled={disabled || loading}
                className="h-4 w-4"
              />
              <label htmlFor="select-all" className="text-body-sm font-medium cursor-pointer">
                Selecionar {allSelected ? "nenhum" : "tudo"}
              </label>
            </div>

            <div className="max-h-96 space-y-2 overflow-y-auto rounded-lg border border-gray-3 p-4 dark:border-dark-3">
              {eligibleContacts.map((contact) => (
                <div key={contact.id} className="flex items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    id={contact.id}
                    checked={selectedIds.has(contact.id)}
                    onChange={() => toggleContact(contact.id)}
                    disabled={disabled || loading}
                    className="h-4 w-4"
                  />
                  <label htmlFor={contact.id} className="flex-1 cursor-pointer">
                    <div className="text-body-sm font-medium">{contact.name}</div>
                    <div className="text-body-xs text-dark-6">{contact.phoneE164}</div>
                  </label>
                </div>
              ))}
            </div>

            {total > 50 && (
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => loadContacts(Math.max(1, page - 1))}
                  disabled={page === 1 || loading}
                  className="px-3 py-1 text-sm border rounded disabled:opacity-50"
                >
                  ← Anterior
                </button>
                <span className="px-3 py-1 text-sm">{page}</span>
                <button
                  onClick={() => loadContacts(page + 1)}
                  disabled={page * 50 >= total || loading}
                  className="px-3 py-1 text-sm border rounded disabled:opacity-50"
                >
                  Próxima →
                </button>
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={disabled || loading}
              className="w-full rounded-lg bg-primary px-4 py-2 text-white font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Salvando..." : "Salvar Seleção"}
            </button>
          </>
        )}
      </div>
    </ListCard>
  );
}
