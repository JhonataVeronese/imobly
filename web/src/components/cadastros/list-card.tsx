import { cn } from "@/lib/utils";
import type { PropsWithChildren } from "react";

type Props = PropsWithChildren<{ className?: string; title?: string; actions?: React.ReactNode }>;

/** Cartão branco das listagens do template (borda, sombra e padding responsivo). */
export function ListCard({ className, title, actions, children }: Props) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-[10px] border border-stroke bg-white p-4 shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card sm:p-7.5",
        className,
      )}
    >
      {(title || actions) && (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {title && <h3 className="text-lg font-semibold text-dark dark:text-white">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

/** Classe do cabeçalho de tabela usada em todas as listagens do template. */
export const TABLE_HEADER_ROW_CLASS =
  "border-none bg-[#F7F9FC] dark:bg-dark-2 [&>th]:py-4 [&>th]:text-base [&>th]:text-dark [&>th]:dark:text-white";
