"use client";

import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/utils";
import {
  fetchConversation,
  resetSimulator,
  sendAgentMessage,
  sendContactMessage,
  startSimulator,
} from "@/services/simulador.service";
import type { MessageStatus } from "@/types/campanha";
import type { SimulatorContact, SimulatorEntry, SimulatorState } from "@/types/simulador";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

const POLL_MS = 1500;

const SAMPLE_AD = `Apartamento à venda no Centro

3 quartos, 1 suíte, 2 vagas. 85 m²

Valor: R$ 450.000.

Aceita financiamento.`;

const AGENT_CHIPS = ["CONFIRMAR", "STATUS", "PAUSAR", "RETOMAR", "CANCELAR", "AJUDA"];
const CONTACT_CHIPS = ["Tenho interesse!", "SAIR", "VOLTAR"];

export function SimuladorClient() {
  const [state, setState] = useState<SimulatorState | null>(null);
  const [entries, setEntries] = useState<SimulatorEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [needsPhone, setNeedsPhone] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const lastSeq = useRef(0);

  const merge = useCallback((s: SimulatorState, replace = false) => {
    setState(s);
    setEntries((prev) => {
      const base = replace ? [] : prev;
      const known = new Set(base.map((e) => e.seq));
      const next = [...base, ...s.entries.filter((e) => !known.has(e.seq))].sort((a, b) => a.seq - b.seq);
      lastSeq.current = next.at(-1)?.seq ?? 0;
      return next;
    });
    setSelected((cur) => cur ?? s.contacts[0]?.id ?? null);
  }, []);

  const start = useCallback(async () => {
    try {
      merge(await startSimulator(), true);
      setError(null);
      setNeedsPhone(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível abrir o simulador.";
      setNeedsPhone(/telefone/i.test(msg));
      setError(msg);
    }
  }, [merge]);

  useEffect(() => {
    void start();
  }, [start]);

  // Atualização contínua: a conversa avança sozinha (worker, fila, status de entrega).
  useEffect(() => {
    if (!state) return;
    const t = setInterval(() => {
      fetchConversation(lastSeq.current)
        .then((s) => merge(s))
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [state, merge]);

  const handleReset = async () => {
    if (!window.confirm("Apagar a conversa, as campanhas e os imóveis criados no simulador?")) return;
    await resetSimulator();
    lastSeq.current = 0;
    setSelected(null);
    await start();
  };

  const contact = state?.contacts.find((c) => c.id === selected) ?? null;
  const agentEntries = useMemo(() => entries.filter((e) => e.chat === state?.agentPhone), [entries, state?.agentPhone]);
  const contactEntries = useMemo(() => entries.filter((e) => contact && e.chat === contact.phone), [entries, contact]);
  /** Quantas mensagens a Auren já mandou para cada cliente. */
  const received = useMemo(() => {
    const out: Record<string, number> = {};
    for (const e of entries) if (e.direction === "out" && e.chat !== state?.agentPhone) out[e.chat] = (out[e.chat] ?? 0) + 1;
    return out;
  }, [entries, state?.agentPhone]);

  if (error && !state) {
    return (
      <div className="rounded-xl border border-red/30 bg-red-light-6 p-6 text-dark dark:bg-red/10 dark:text-white">
        <p className="font-bold">Não foi possível abrir o simulador</p>
        <p className="mt-1 text-sm">{error}</p>
        {needsPhone && (
          <Link href="/configuracoes/usuarios" className="mt-3 inline-block text-sm font-bold underline decoration-neon decoration-2">
            Ir para Usuários
          </Link>
        )}
      </div>
    );
  }
  if (!state) return <p className="text-sm">Preparando o número de teste…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border border-neon/50 bg-neon/10 p-4 text-sm text-dark dark:text-white/85 md:flex-row md:items-center md:justify-between">
        <p className="flex gap-3">
          <BrandMark className="mt-0.5 size-5 shrink-0" color="currentColor" />
          <span>
            Tudo aqui passa pelo fluxo real (webhook, fila de entrada, comandos, campanha e fila de envio), mas{" "}
            <strong>nada sai para o WhatsApp</strong> e só os contatos de teste recebem. O ritmo é acelerado para caber na tela:{" "}
            <strong>2 a 4 s</strong> entre clientes e pausa de 12 s a cada 3. No número real são 20 a 40 s, pausa de 10 min a cada 40,
            das 8h às 20h.
          </span>
        </p>
        <button
          type="button"
          onClick={() => void handleReset()}
          className="shrink-0 rounded-lg border border-dark/20 px-4 py-2 font-semibold hover:bg-dark/5 dark:border-white/20 dark:hover:bg-white/5"
        >
          Limpar simulação
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_300px_minmax(0,1fr)]">
        <AgentPhone entries={agentEntries} statuses={state.statuses} />

        <div className="space-y-6">
          <QueueCard state={state} />
          <ContactsCard contacts={state.contacts} selected={selected} onSelect={setSelected} received={received} />
        </div>

        {contact ? (
          <ContactPhone contact={contact} entries={contactEntries} statuses={state.statuses} />
        ) : (
          <p className="text-sm">Nenhum contato de teste.</p>
        )}
      </div>
    </div>
  );
}

function AgentPhone({ entries, statuses }: { entries: SimulatorEntry[]; statuses: Record<string, MessageStatus> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const send = async (value: string, file?: File | null) => {
    if (!value.trim() && !file) return;
    setBusy(true);
    setErr(null);
    try {
      await sendAgentMessage(value, file);
      setText("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao enviar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Phone
      title="Auren"
      subtitle="você é o corretor"
      hint="Converse com o bot como no WhatsApp: mande o anúncio, fotos e PDF, depois os comandos."
      entries={entries}
      statuses={statuses}
      mine="in"
      empty={
        <div className="space-y-3 text-center text-[12.5px] text-white/60">
          <p>Comece mandando um anúncio. Use o exemplo abaixo ou cole o seu.</p>
          <button
            type="button"
            onClick={() => void send(SAMPLE_AD)}
            className="rounded-full bg-neon px-4 py-1.5 text-xs font-bold text-ink"
          >
            Enviar anúncio de exemplo
          </button>
        </div>
      }
      chips={[
        { label: "Anúncio de exemplo", onClick: () => setText(SAMPLE_AD) },
        ...AGENT_CHIPS.map((c) => ({ label: c, onClick: () => void send(c) })),
      ]}
      footer={
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void send(text, f);
            }}
          />
          <button
            type="button"
            title="Anexar foto ou PDF"
            onClick={() => fileRef.current?.click()}
            className="grid size-9 shrink-0 place-items-center rounded-full text-white/70 hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7" strokeLinecap="round" />
            </svg>
          </button>
          <Composer value={text} onChange={setText} onSend={() => void send(text)} busy={busy} multiline />
        </>
      }
      error={err}
    />
  );
}

function ContactPhone({
  contact,
  entries,
  statuses,
}: {
  contact: SimulatorContact;
  entries: SimulatorEntry[];
  statuses: Record<string, MessageStatus>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async (value: string) => {
    if (!value.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await sendContactMessage(contact.id, value);
      setText("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao enviar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Phone
      title="Imobiliária"
      subtitle={`celular de ${contact.name}`}
      hint="É isto que o cliente recebe. Responda como ele: SAIR descadastra na hora, VOLTAR reativa."
      entries={entries}
      statuses={statuses}
      mine="in"
      empty={
        <p className="text-center text-[12.5px] text-white/60">
          {contact.canReceive
            ? "Nada recebido ainda. Confirme uma campanha compatível com o perfil deste cliente."
            : "Este cliente pediu para sair e não recebe campanhas."}
        </p>
      }
      chips={CONTACT_CHIPS.map((c) => ({ label: c, onClick: () => void send(c) }))}
      footer={<Composer value={text} onChange={setText} onSend={() => void send(text)} busy={busy} />}
      error={err}
    />
  );
}

type Chip = { label: string; onClick: () => void };

function Phone({
  title,
  subtitle,
  hint,
  entries,
  statuses,
  mine,
  empty,
  chips,
  footer,
  error,
}: {
  title: string;
  subtitle: string;
  hint: string;
  entries: SimulatorEntry[];
  statuses: Record<string, MessageStatus>;
  /** Direção das mensagens "minhas" (lado direito, verde). */
  mine: "in" | "out";
  empty: ReactNode;
  chips: Chip[];
  footer: ReactNode;
  error: string | null;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const toBottom = useCallback(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  useEffect(() => {
    toBottom();
  }, [entries.length, toBottom]);

  return (
    <section className="min-w-0">
      <p className="mb-3 text-sm">{hint}</p>
      <div className="mx-auto w-full max-w-[440px] rounded-[38px] border-[6px] border-[#2A2A2A] bg-[#0E1512] p-2 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)]">
        <div className="flex h-[640px] flex-col overflow-hidden rounded-[30px] bg-[#0B141A]">
          <div className="flex items-center gap-2.5 bg-[#1F2C34] px-4 py-3">
            <span className="grid size-9 place-items-center rounded-full bg-ink">
              <BrandMark className="size-6" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">{title}</span>
              <span className="block truncate text-[11px] text-white/60">{subtitle}</span>
            </span>
          </div>

          <div ref={scroller} className="flex-1 space-y-2 overflow-y-auto px-3 py-4">
            {entries.length === 0 ? <div className="pt-10">{empty}</div> : null}
            {entries.map((e) => (
              <Bubble
                key={e.seq}
                entry={e}
                own={e.direction === mine}
                status={e.providerMessageId ? statuses[e.providerMessageId] : undefined}
                onMediaLoad={toBottom}
              />
            ))}
          </div>

          <div className="flex gap-1.5 overflow-x-auto px-3 pb-2 pt-1">
            {chips.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={c.onClick}
                className="shrink-0 rounded-full border border-neon/40 px-3 py-1 text-[11px] font-bold text-neon hover:bg-neon/10"
              >
                {c.label}
              </button>
            ))}
          </div>
          {error ? <p className="px-4 pb-1 text-[11px] text-red-light">{error}</p> : null}
          <div className="flex items-end gap-1.5 px-3 pb-3">{footer}</div>
        </div>
      </div>
    </section>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  busy,
  multiline = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  busy: boolean;
  multiline?: boolean;
}) {
  return (
    <>
      <textarea
        value={value}
        rows={multiline && value.includes("\n") ? 4 : 1}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder="Digite uma mensagem"
        className="min-w-0 flex-1 resize-none rounded-2xl bg-[#1F2C34] px-4 py-2 text-[13px] text-white outline-none placeholder:text-white/40"
      />
      <button
        type="button"
        disabled={busy}
        onClick={onSend}
        title="Enviar (Enter). Shift+Enter quebra a linha."
        className="grid size-9 shrink-0 place-items-center rounded-full bg-[#00A884] disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
          <path d="M3 20.5 21 12 3 3.5 5.5 12 3 20.5Z" fill="#fff" />
        </svg>
      </button>
    </>
  );
}

function Bubble({
  entry,
  own,
  status,
  onMediaLoad,
}: {
  entry: SimulatorEntry;
  own: boolean;
  status?: MessageStatus;
  onMediaLoad: () => void;
}) {
  const time = new Date(entry.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return (
    <div
      className={cn(
        "max-w-[85%] overflow-hidden rounded-xl text-[12.5px] leading-snug text-white/90",
        own ? "ml-auto rounded-tr-sm bg-[#005C4B]" : "mr-auto rounded-tl-sm bg-[#1F2C34]",
        entry.error && "ring-1 ring-red/70",
      )}
    >
      {entry.kind === "image" &&
        (entry.media ? (
          // eslint-disable-next-line @next/next/no-img-element -- data: URL/URL assinada da mídia simulada
          <img src={entry.media} alt="" onLoad={onMediaLoad} className="max-h-56 w-full object-cover" />
        ) : (
          <p className="px-3 pt-2 text-white/60">📷 Foto</p>
        ))}
      {entry.kind === "document" && (
        <p className="m-2 flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2">
          <span className="rounded bg-red px-1.5 py-0.5 text-[10px] font-bold text-white">PDF</span>
          <span className="truncate">{entry.fileName ?? "documento.pdf"}</span>
        </p>
      )}
      <div className="px-3 py-2">
        {entry.text ? <p className="whitespace-pre-wrap break-words">{formatWhatsApp(entry.text)}</p> : null}
        {entry.error ? <p className="mt-1 text-[11px] font-semibold text-red-light">⚠ Não enviado: {entry.error}</p> : null}
        <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-white/50">
          {time}
          {entry.direction === "out" && entry.providerMessageId ? <Ticks status={status} /> : null}
        </span>
      </div>
    </div>
  );
}

/** ✓ enviada · ✓✓ entregue · ✓✓ azul lida (status simulados pelo provedor). */
function Ticks({ status }: { status?: MessageStatus }) {
  const delivered = status === "delivered" || status === "read";
  const label = status === "read" ? "lida" : delivered ? "entregue" : "enviada";
  return (
    <span title={label} className={cn("font-bold", status === "read" ? "text-[#53BDEB]" : "text-white/60")}>
      {delivered ? "✓✓" : "✓"}
    </span>
  );
}

/** *negrito* e _itálico_ do WhatsApp, sem HTML cru. */
function formatWhatsApp(text: string): ReactNode {
  return text.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).map((part, i) => {
    if (/^\*[^*\n]+\*$/.test(part)) return <strong key={i}>{part.slice(1, -1)}</strong>;
    if (/^_[^_\n]+_$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function QueueCard({ state }: { state: SimulatorState }) {
  const c = state.campaign;
  const steps = [
    "Você manda o anúncio (texto, fotos, PDF)",
    "O bot responde com o resumo e o público",
    "CONFIRMAR coloca a campanha na fila",
    "A fila envia um cliente por vez",
    "O cliente recebe e pode responder SAIR",
  ];
  return (
    <div className="rounded-xl bg-white p-5 shadow-1 dark:bg-gray-dark">
      <p className="rotulo text-dark-5 dark:text-neon">Fila do número de teste</p>
      {c ? (
        <>
          <p className="mt-2 font-bold text-dark dark:text-white">{c.name}</p>
          <p className="text-sm">{c.statusLabel}</p>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            {(
              [
                ["Público", c.eligible],
                ["Na fila", c.queued],
                ["Aceitas", c.accepted],
                ["Entregues", c.delivered],
                ["Lidas", c.read],
                ["Falhas", c.failed],
                ["Descadastros", c.optOuts],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-gray-2 px-3 py-2 dark:bg-ink">
                <dt className="text-xs text-dark-6">{k}</dt>
                <dd className="font-extrabold text-dark dark:text-white">{v}</dd>
              </div>
            ))}
          </dl>
          {c.eta ? <p className="mt-3 text-sm">⏱ Previsão: {c.eta}</p> : null}
        </>
      ) : (
        <ol className="mt-3 space-y-2 text-sm">
          {steps.map((s, i) => (
            <li key={s} className="flex gap-2">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-neon text-[11px] font-extrabold text-ink">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ContactsCard({
  contacts,
  selected,
  onSelect,
  received,
}: {
  contacts: SimulatorContact[];
  selected: string | null;
  onSelect: (id: string) => void;
  received: Record<string, number>;
}) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-1 dark:bg-gray-dark">
      <p className="rotulo text-dark-5 dark:text-neon">Clientes de teste</p>
      <p className="mt-1 text-xs text-dark-6">Perfis diferentes: veja quem entra no público de cada imóvel. O número verde é quantas mensagens o cliente recebeu.</p>
      <ul className="mt-3 space-y-2">
        {contacts.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className={cn(
                "w-full rounded-lg border px-3 py-2 text-left transition",
                selected === c.id ? "border-neon bg-neon/10" : "border-stroke hover:border-neon/60 dark:border-stroke-dark",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-bold text-dark dark:text-white">{c.name}</span>
                {received[c.phone] ? (
                  <span title="Mensagens recebidas da Auren" className="rounded-full bg-[#00A884] px-1.5 text-[10px] font-bold text-white">
                    {received[c.phone]}
                  </span>
                ) : null}
              </span>
              <span className="block text-xs text-dark-6">{c.profile}</span>
              {!c.canReceive ? <span className="mt-1 block text-[11px] font-semibold text-red">Descadastrado</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
