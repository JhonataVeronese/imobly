import { cn } from "@/lib/utils";

type Props = { variant: "error" | "success" | "info"; children: React.ReactNode; className?: string };

const VARIANT_CLASS = {
  error: "border-red/30 bg-red/10 text-red dark:bg-red/15",
  success: "border-green/30 bg-green/10 text-green dark:bg-green/15",
  info: "border-primary/30 bg-primary/5 text-primary dark:bg-primary/10",
} as const;

/** Mensagem inline de formulário/ação, no mesmo estilo dos avisos do template. */
export function FormFeedback({ variant, children, className }: Props) {
  return (
    <div role={variant === "error" ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-sm", VARIANT_CLASS[variant], className)}>
      {children}
    </div>
  );
}

export const PRIMARY_BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

export const SECONDARY_BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-stroke px-5 py-2.5 text-sm font-medium text-dark transition hover:bg-gray-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:text-white dark:hover:bg-dark-2";

export const DANGER_BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-red/40 px-5 py-2.5 text-sm font-medium text-red transition hover:bg-red/10 disabled:cursor-not-allowed disabled:opacity-60";
