import type { SVGProps } from "react";

/** Ícones de linha da marca (Campanhas, Imóveis, Clientes), em `currentColor`. */
type P = SVGProps<SVGSVGElement>;
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function MegaphoneIcon(props: P) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M3 10v4a1 1 0 0 0 1 1h3l6 4V5L7 9H4a1 1 0 0 0-1 1Z" />
      <path d="M7 15l1.5 5h2.5l-1-4.5" />
      <path d="M17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11" />
    </svg>
  );
}

export function HouseIcon(props: P) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M3 11 12 4l9 7" />
      <path d="M5 9.5V20h5v-6h4v6h5V9.5" />
    </svg>
  );
}

export function PeopleIcon(props: P) {
  return (
    <svg {...base} aria-hidden {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
    </svg>
  );
}

export function BookIcon(props: P) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z" />
      <path d="M4 19a2 2 0 0 1 2-2h13M8 7h7M8 11h5" />
    </svg>
  );
}

/** Faixa "Campanhas | Imóveis | Clientes" da peça principal. */
export function BrandPillars({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const items = [
    { label: "Campanhas", Icon: MegaphoneIcon },
    { label: "Imóveis", Icon: HouseIcon },
    { label: "Clientes", Icon: PeopleIcon },
  ];
  return (
    <ul className={`flex flex-wrap items-center ${compact ? "gap-x-4 gap-y-2 text-sm" : "gap-x-5 gap-y-3"} ${className}`}>
      {items.map(({ label, Icon }, i) => (
        <li key={label} className="flex items-center gap-2 font-semibold text-white">
          {i > 0 && !compact ? <span aria-hidden className="mr-3 hidden h-6 w-px bg-neon/40 sm:block" /> : null}
          <Icon className={`${compact ? "size-5" : "size-6"} text-neon`} />
          {label}
        </li>
      ))}
    </ul>
  );
}
