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
export function WhatsAppPreview({ messages, title = "Auren", subtitle = "Sistemas", className }: Props) {
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

function HouseIllustration() {
  const windows = [
    [72, 40, 30, 16],
    [106, 40, 38, 16],
    [48, 68, 34, 30],
    [88, 68, 34, 30],
    [128, 68, 36, 30],
  ];
  return (
    <svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="auren-house-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1A2740" />
          <stop offset=".55" stopColor="#4B4256" />
          <stop offset="1" stopColor="#C98A4E" />
        </linearGradient>
        <linearGradient id="auren-house-light" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE29A" />
          <stop offset="1" stopColor="#F2A93B" />
        </linearGradient>
        <linearGradient id="auren-house-pool" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3FC6E8" />
          <stop offset="1" stopColor="#1679A6" />
        </linearGradient>
      </defs>
      <rect width="200" height="120" fill="url(#auren-house-sky)" />
      <circle cx="14" cy="78" r="18" fill="#16251C" />
      <circle cx="30" cy="86" r="14" fill="#1C3024" />
      <circle cx="188" cy="74" r="20" fill="#16251C" />
      <rect y="96" width="200" height="24" fill="#1E3326" />
      <rect x="60" y="30" width="96" height="6" fill="#15171B" />
      <rect x="66" y="36" width="84" height="24" fill="#3A3D44" />
      <rect x="36" y="58" width="140" height="6" fill="#15171B" />
      <rect x="42" y="64" width="128" height="34" fill="#2C2F35" />
      {windows.map(([x, y, w, h]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} fill="url(#auren-house-light)" />
      ))}
      {[64, 104, 145].map((x) => (
        <rect key={x} x={x} y="68" width="1.5" height="30" fill="#2C2F35" />
      ))}
      <rect x="30" y="102" width="150" height="12" rx="1.5" fill="url(#auren-house-pool)" />
      <rect x="48" y="104" width="34" height="2" fill="#FFE29A" opacity=".55" />
      <rect x="128" y="104" width="36" height="2" fill="#FFE29A" opacity=".55" />
    </svg>
  );
}

function PropertyCard() {
  return (
    <>
      <div className="max-w-[88%] self-start rounded-xl rounded-tl-sm bg-[#1F2C34] px-3 py-2 text-[12.5px] leading-snug text-white/90">
        Olá! Encontrei um imóvel que pode te interessar. Veja os detalhes abaixo:
      </div>
      <div className="self-start overflow-hidden rounded-xl bg-[#1F2C34] text-white">
        {/* Ilustração no lugar da foto do imóvel: casa moderna ao entardecer, como na peça da marca. */}
        <div className="relative h-36">
          <HouseIllustration />
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
