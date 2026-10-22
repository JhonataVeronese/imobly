"use client";

import { SECONDARY_BUTTON_CLASS } from "@/components/cadastros/form-feedback";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "active", label: "Ativos" },
  { value: "opted_out", label: "Descadastrados" },
  { value: "blocked", label: "Bloqueados" },
] as const;

type Props = { q: string; status: string; page: number; totalPages: number };

/** Busca e paginação via query string — a listagem é renderizada no servidor. */
export function ContatosFilters({ q, status, page, totalPages }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [term, setTerm] = useState(q);

  const go = (next: { q?: string; status?: string; page?: number }) => {
    const params = new URLSearchParams();
    const nq = next.q ?? q;
    const ns = next.status ?? status;
    const np = next.page ?? 1;
    if (nq) params.set("q", nq);
    if (ns) params.set("status", ns);
    if (np > 1) params.set("page", String(np));
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const inputClass =
    "rounded-lg border border-stroke bg-transparent px-4 py-2 text-body-sm outline-none focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: term.trim() });
        }}
      >
        <input aria-label="Buscar" placeholder="Nome ou telefone" value={term} onChange={(e) => setTerm(e.target.value)} className={inputClass} />
        <button type="submit" className={SECONDARY_BUTTON_CLASS}>
          Buscar
        </button>
      </form>
      <select aria-label="Status" value={status} onChange={(e) => go({ status: e.target.value })} className={inputClass}>
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {totalPages > 1 && (
        <div className="flex items-center gap-2 sm:ml-auto">
          <button type="button" className={SECONDARY_BUTTON_CLASS} disabled={page <= 1} onClick={() => go({ page: page - 1 })}>
            Anterior
          </button>
          <span className="text-body-sm text-dark-6">
            {page}/{totalPages}
          </span>
          <button type="button" className={SECONDARY_BUTTON_CLASS} disabled={page >= totalPages} onClick={() => go({ page: page + 1 })}>
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}
