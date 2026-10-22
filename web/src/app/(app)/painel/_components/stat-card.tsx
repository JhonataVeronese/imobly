import type { ComponentType, SVGProps } from "react";

type Props = {
  label: string;
  value: string | number;
  hint?: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

/** Mesmo visual do `OverviewCard` do template, sem a variação percentual. */
export function StatCard({ label, value, hint, Icon }: Props) {
  return (
    <div className="rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark">
      <span className="grid size-[58px] place-items-center rounded-full bg-neon text-ink dark:bg-primary/10 dark:text-primary">
        <Icon className="size-7" aria-hidden />
      </span>

      <dl className="mt-6">
        <dt className="mb-1.5 text-heading-6 font-bold text-dark dark:text-white">{value}</dt>
        <dd className="text-sm font-medium text-dark-6">{label}</dd>
      </dl>
      {hint ? <p className="mt-3 text-body-xs leading-snug text-dark-6">{hint}</p> : null}
    </div>
  );
}
