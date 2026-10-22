import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { BrandMark } from "../brand-mark";

export type ChatBubble = {
  from: "me" | "bot";
  text: ReactNode;
  time?: string;
};

type Props = {
  /** Mensagens da conversa. Sem mensagens, mostra o cartão de imóvel da peça da marca. */
  messages?: ChatBubble[];
  title?: string;
  subtitle?: string;
  className?: string;
};

/** Celular com uma conversa do WhatsApp no visual da marca (peça "Seu próximo imóvel"). */
export function WhatsAppPreview({ messages, title = "imobly", subtitle = "online", className }: Props) {
  return (
    <div
      className={cn(
        "relative w-full max-w-[320px] rounded-[42px] border-[6px] border-[#2A2A2A] bg-[#0E1512] p-2 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]",
        className,
      )}
    >
      <div className="overflow-hidden rounded-[34px] bg-[#0B141A]">
        <div className="flex items-center gap-2.5 bg-[#1F2C34] px-4 pb-3 pt-6">
          <span className="grid size-9 place-items-center rounded-full bg-ink">
            <BrandMark className="size-6" />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-sm font-semibold text-white">
              {title}
              <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
                <circle cx="8" cy="8" r="8" fill="#25D366" />
                <path d="M4.5 8.2 7 10.5l4.5-5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" />
              </svg>
            </span>
            <span className="block text-[11px] text-white/60">{subtitle}</span>
          </span>
        </div>

        <div className="flex min-h-[360px] flex-col gap-2 px-3 py-4">
          {messages ? (
            messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[85%] whitespace-pre-line rounded-xl px-3 py-2 text-[12.5px] leading-snug text-white/90",
                  m.from === "me" ? "self-end rounded-tr-sm bg-[#005C4B]" : "self-start rounded-tl-sm bg-[#1F2C34]",
                )}
              >
                {m.text}
                {m.time ? <span className="mt-1 block text-right text-[10px] text-white/50">{m.time}</span> : null}
              </div>
            ))
          ) : (
            <PropertyCard />
          )}
        </div>

        <div className="flex items-center gap-2 px-3 pb-4">
          <span className="flex-1 rounded-full bg-[#1F2C34] px-4 py-2 text-[11px] text-white/40">Digite uma mensagem</span>
          <span className="grid size-9 place-items-center rounded-full bg-[#00A884]">
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
              <path d="M3 20.5 21 12 3 3.5 5.5 12 3 20.5Z" fill="#fff" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}

function PropertyCard() {
  return (
    <>
      <div className="max-w-[88%] self-start rounded-xl rounded-tl-sm bg-[#1F2C34] px-3 py-2 text-[12.5px] leading-snug text-white/90">
        Olá! Encontrei um imóvel que pode te interessar. Veja os detalhes abaixo:
      </div>
      <div className="self-start overflow-hidden rounded-xl bg-[#1F2C34] text-white">
        {/* Ilustração no lugar da foto do imóvel. */}
        <div className="relative h-32 bg-gradient-to-br from-[#2b3a4a] via-[#1d2833] to-[#3a2f12]">
          <svg viewBox="0 0 200 110" className="absolute inset-x-0 bottom-0 h-full w-full" aria-hidden>
            <rect x="30" y="45" width="140" height="55" rx="3" fill="#121a22" />
            <rect x="20" y="38" width="160" height="10" rx="2" fill="#0b1117" />
            <rect x="45" y="58" width="34" height="24" rx="2" fill="#FFD600" opacity=".85" />
            <rect x="88" y="58" width="34" height="24" rx="2" fill="#FFD600" opacity=".6" />
            <rect x="131" y="58" width="22" height="42" rx="2" fill="#FFD600" opacity=".75" />
            <rect x="0" y="100" width="200" height="10" fill="#1b3a24" />
          </svg>
          <span className="absolute left-2 top-2 grid size-7 place-items-center rounded-md bg-ink/80">
            <BrandMark className="size-5" />
          </span>
        </div>
        <div className="space-y-1.5 p-3">
          <p className="text-sm font-semibold">Casa em Condomínio</p>
          <p className="text-[11px] text-white/70">3 quartos · 2 vagas · 180 m²</p>
          <p className="text-[11px] text-white/70">Condomínio Jardim das Flores</p>
          <p className="text-sm font-bold">R$ 850.000,00</p>
          <span className="mt-1 block rounded-lg bg-neon py-2 text-center text-xs font-bold text-ink">Quero mais informações</span>
        </div>
      </div>
    </>
  );
}
