import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement> & {
  /** Cor do traço e das reticências (padrão: amarelo da marca). */
  color?: string;
  /** "outline": balão vazado (padrão). "solid": balão preenchido com reticências em `dotsColor`. */
  variant?: "outline" | "solid";
  dotsColor?: string;
};

/** Símbolo da Auren (manual da marca): perna do "A" + telhado com chaminé + balão de conversa com reticências. */
export function BrandMark({ color = "#FFD600", variant = "outline", dotsColor = "#0B0B0B", ...props }: Props) {
  const solid = variant === "solid";
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden {...props}>
      <path d="M5 58 L19 7 L27 21" stroke={color} strokeWidth={7} strokeLinejoin="miter" />
      <path d="M25 27 L43 10 L61 27" stroke={color} strokeWidth={6} strokeLinejoin="miter" />
      <rect x={50} y={8} width={6} height={12} fill={color} />
      <circle cx={40} cy={40} r={12.5} stroke={color} strokeWidth={5.5} fill={solid ? color : "none"} />
      <path d="M46 49 L56 59 L52.5 45 Z" fill={color} />
      {[34, 40, 46].map((cx) => (
        <circle key={cx} cx={cx} cy={40} r={2.6} fill={solid ? dotsColor : color} />
      ))}
    </svg>
  );
}
