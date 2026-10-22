import Link from "next/link";

type Props = {
  description: React.ReactNode;
  action?: { href: string; label: string };
};

/** Linha abaixo do breadcrumb: texto explicativo + ação principal (padrão das listagens). */
export function PageIntro({ description, action }: Props) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-body-sm text-dark-4 dark:text-dark-6">{description}</p>
      {action && (
        <Link
          href={action.href}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-center font-semibold text-primary-foreground transition hover:bg-opacity-90"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
