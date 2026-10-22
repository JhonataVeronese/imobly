import Link from "next/link";

type Props = {
  href: string;
  /** Texto do botão (default: "Voltar à listagem"). */
  label?: string;
};

export function BackToListingLink({ href, label = "Voltar à listagem" }: Props) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-lg border border-stroke px-4 py-2.5 text-sm font-medium text-dark transition hover:bg-gray-2 dark:border-dark-3 dark:text-white dark:hover:bg-dark-2"
    >
      <span aria-hidden className="select-none">
        ←
      </span>
      {label}
    </Link>
  );
}
