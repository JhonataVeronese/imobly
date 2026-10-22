import type { ProviderAccount } from "@prisma/client";
import { parseContactCommand } from "../domain/commands.js";
import { phoneMatchKey } from "../domain/phone.js";
import type { InboundMessageEvent } from "../ports/inbound.js";
import { grantConsent, isSuppressed, optOutByPhone } from "./consent-service.js";
import { audit, type AppDeps } from "./deps.js";
import { handleAgentMessage, sendReply } from "./property-intake.js";
import { applyStatusUpdate } from "./status-service.js";

export class RetryLaterError extends Error {}

export interface InboundAttempt {
  attempt: number;
  maxAttempts: number;
}

/** Variações de um número BR com/sem o 9º dígito, para casar remetentes. */
export function phoneVariants(digits: string): string[] {
  const d = digits.replace(/\D/g, "");
  const out = new Set([`+${d}`]);
  if (d.startsWith("55") && d.length === 13 && d[4] === "9") out.add(`+${d.slice(0, 4)}${d.slice(5)}`);
  if (d.startsWith("55") && d.length === 12 && /[6-9]/.test(d[4]!)) out.add(`+${d.slice(0, 4)}9${d.slice(4)}`);
  return [...out];
}

/**
 * Processamento assíncrono (worker) de um webhook já persistido.
 * Idempotente: eventos já processados/ignorados não são reprocessados.
 */
export async function processWebhookEvent(deps: AppDeps, webhookEventId: string, attempt: InboundAttempt): Promise<string> {
  const { db } = deps;
  const ev = await db.webhookEvent.findUnique({ where: { id: webhookEventId } });
  if (!ev || !ev.tenantId) return "missing";
  if (ev.processingStatus === "processed" || ev.processingStatus === "ignored") return "already_processed";

  const adapter = deps.inbound[ev.provider];
  if (!adapter) return finish(deps, ev.id, "failed", "adapter_missing");
  const event = adapter.parse(ev.payload);
  const account = await db.providerAccount.findFirst({
    where: {
      tenantId: ev.tenantId,
      provider: ev.provider,
      ...(event.accountReference ? { accountReference: event.accountReference } : {}),
    },
  });
  if (!account) return finish(deps, ev.id, "ignored", "account_missing");

  try {
    if (event.type === "ignored") return finish(deps, ev.id, "ignored", event.reason);

    if (event.type === "status") {
      if (event.isGroup) return finish(deps, ev.id, "ignored", "group_status");
      const matched = await applyStatusUpdate(deps, ev.tenantId, event.providerMessageIds, event.status, event.occurredAt, event.errorCode);
      if (matched === 0) {
        // Pode ter chegado antes de gravarmos o messageId do envio. Tenta mais algumas vezes.
        if (attempt.attempt < attempt.maxAttempts) throw new RetryLaterError("status sem mensagem correspondente ainda");
        return finish(deps, ev.id, "ignored", "no_matching_message");
      }
      return finish(deps, ev.id, "processed", `status:${event.status}`);
    }

    const note = await routeMessage(deps, account, event);
    return finish(deps, ev.id, note.startsWith("ignored:") ? "ignored" : "processed", note);
  } catch (err) {
    if (err instanceof RetryLaterError) throw err;
    if (attempt.attempt >= attempt.maxAttempts) await finish(deps, ev.id, "failed", (err as Error).message.slice(0, 300));
    throw err;
  }
}

async function routeMessage(deps: AppDeps, account: ProviderAccount, msg: InboundMessageEvent): Promise<string> {
  // Mensagens enviadas pelo próprio número (inclui as respostas do sistema) — evita loops.
  if (msg.fromMe) return "ignored:from_me";

  const tenantId = account.tenantId;
  const isInboundChannel =
    account.inboundMode === "group" ? msg.isGroup && msg.chatId === account.inboundChatId : !msg.isGroup;

  if (msg.isGroup && !isInboundChannel) return "ignored:group_not_configured";

  if (isInboundChannel) {
    const user = msg.senderPhone ? await findAuthorizedUser(deps, tenantId, msg.senderPhone) : null;
    if (user) return `agent:${await handleAgentMessage(deps, account, user, msg)}`;
    if (msg.isGroup) {
      await audit(deps.db, tenantId, { type: "system" }, "inbound.unauthorized_sender", "webhook", null, {
        senderPhone: msg.senderPhone,
        chatId: msg.chatId,
      });
      return "ignored:unauthorized_sender";
    }
    // Modo direto: quem não é corretor autorizado é tratado como contato.
  }

  return handleContactMessage(deps, account, msg);
}

async function findAuthorizedUser(deps: AppDeps, tenantId: string, senderDigits: string) {
  const users = await deps.db.user.findMany({ where: { tenantId, status: "active", phoneE164: { not: null } } });
  const key = phoneMatchKey(senderDigits);
  return users.find((u) => phoneMatchKey(u.phoneE164!) === key) ?? null;
}

async function handleContactMessage(deps: AppDeps, account: ProviderAccount, msg: InboundMessageEvent): Promise<string> {
  if (!msg.senderPhone || !msg.text) return "ignored:contact_non_text";
  const tenantId = account.tenantId;
  const command = parseContactCommand(msg.text);
  if (!command) return "contact_reply"; // Fase 3: análise de respostas / encaminhar ao corretor

  const variants = phoneVariants(msg.senderPhone);
  const contact = await deps.db.contact.findFirst({ where: { tenantId, phoneE164: { in: variants } } });
  const phone = contact?.phoneE164 ?? variants[0]!;

  if (command === "opt_out") {
    const r = await optOutByPhone(deps.db, tenantId, phone, { source: `whatsapp:${msg.messageId}`, reason: "contact_request" }, {
      type: "contact",
      id: contact?.id ?? null,
    });
    if (!r.alreadySuppressed) {
      await sendReply(deps, account, msg.chatId, "Pronto! Você não receberá mais ofertas de imóveis por aqui. Se mudar de ideia, responda VOLTAR.");
    }
    return r.alreadySuppressed ? "opt_out_repeat" : "opt_out";
  }

  // opt_in: pedido explícito do próprio contato, com a mensagem como evidência.
  if (!contact) return "ignored:opt_in_unknown_contact";
  if (!(await isSuppressed(deps.db, tenantId, contact.phoneE164)) && contact.status === "active") return "opt_in_noop";
  await grantConsent(
    deps.db,
    tenantId,
    contact.id,
    { source: "whatsapp_opt_in", evidenceReference: `whatsapp:${msg.messageId}`, overrideSuppression: true },
    { type: "contact", id: contact.id },
  );
  await sendReply(deps, account, msg.chatId, "Combinado! Você voltará a receber ofertas de imóveis. Para sair, responda SAIR.");
  return "opt_in";
}

async function finish(deps: AppDeps, id: string, status: "processed" | "ignored" | "failed", note: string): Promise<string> {
  await deps.db.webhookEvent.update({
    where: { id },
    data: { processingStatus: status, processingNote: note.slice(0, 300), processedAt: deps.now() },
  });
  return note;
}
