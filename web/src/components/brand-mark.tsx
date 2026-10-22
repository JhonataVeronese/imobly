import type { SVGProps } from "react";

/** Contorno do símbolo: casa com a ponta de balão de conversa no canto inferior esquerdo. */
export const BRAND_MARK_PATH = "M32 6 L57 23 V43 Q57 48 52 48 H28 L17 58 V48 H12 Q7 48 7 43 V23 Z";

type Props = SVGProps<SVGSVGElement> & {
  /** Cor do contorno e das reticências (padrão: amarelo da marca). */
  color?: string;
  /** "outline": contorno + reticências (padrão). "solid": casa preenchida com reticências em `dotsColor`. */
  variant?: "outline" | "solid";
  dotsColor?: string;
};

/** Símbolo do imobly (manual da marca): casa + balão de conversa com reticências. */
export function BrandMark({ color = "#FFD600", variant = "outline", dotsColor = "#0B0B0B", ...props }: Props) {
  const solid = variant === "solid";
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden {...props}>
      <path
        d={BRAND_MARK_PATH}
        stroke={color}
        strokeWidth={6}
        strokeLinejoin="round"
        fill={solid ? color : "none"}
      />
      {[21, 32, 43].map((cx) => (
        <circle key={cx} cx={cx} cy={31} r={3.8} fill={solid ? dotsColor : color} />
      ))}
    </svg>
  );
}
