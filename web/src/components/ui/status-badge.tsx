import { cn } from "@/lib/utils";
import type { CampaignStatus, MessageStatus } from "@/types/campanha";
import type { ContactStatus } from "@/types/contato";
import type { PropertyStatus } from "@/types/imovel";

type Tone = "success" | "info" | "warning" | "danger" | "neutral";

const TONE_CLASS: Record<Tone, string> = {
  success: "bg-[#219653]/[0.08] text-[#219653]",
  info: "bg-primary/[0.08] text-primary",
  warning: "bg-[#FFA70B]/[0.08] text-[#D97706]",
  danger: "bg-[#D34053]/[0.08] text-[#D34053]",
  neutral: "bg-gray-2 text-dark-5 dark:bg-dark-2 dark:text-dark-6",
};

const LABELS: Record<string, [string, Tone]> = {
  // campanha
  draft: ["Rascunho", "neutral"],
  awaiting_confirmation: ["Aguardando confirmação", "warning"],
  scheduled: ["Agendada", "info"],
  paused: ["Pausada", "warning"],
  completed: ["Concluída", "success"],
  // mensagem
  queued: ["Na fila", "neutral"],
  processing: ["Processando", "info"],
  accepted: ["Aceita", "info"],
  sent: ["Enviada", "info"],
  delivered: ["Entregue", "success"],
  read: ["Lida", "success"],
  unknown: ["Desconhecida", "warning"],
  // comuns
  failed: ["Falha", "danger"],
  cancelled: ["Cancelada", "danger"],
  // contato
  active: ["Ativo", "success"],
  opted_out: ["Descadastrado", "danger"],
  blocked: ["Bloqueado", "danger"],
  // imóvel
  archived: ["Arquivado", "neutral"],
  // webhook
  pending: ["Pendente", "warning"],
  processed: ["Processado", "success"],
  ignored: ["Ignorado", "neutral"],
};

type Props = {
  status: CampaignStatus | MessageStatus | ContactStatus | PropertyStatus | string;
  className?: string;
};

export function StatusBadge({ status, className }: Props) {
  const [label, tone] = LABELS[status] ?? [status, "neutral" as Tone];
  return (
    <span className={cn("inline-block whitespace-nowrap rounded-full px-3.5 py-1 text-body-sm font-medium", TONE_CLASS[tone], className)}>
      {label}
    </span>
  );
}
