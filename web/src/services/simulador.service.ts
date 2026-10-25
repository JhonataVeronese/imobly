/**
 * Simulador de WhatsApp — tela `/simulador`.
 * Backend: `{IMOBLY_API_URL}/simulator` via BFF `/api/simulator`.
 */
import { bffRequest, jsonInit } from "@/lib/api/bff-request";
import { NEXT_PROXY } from "@/lib/api/saas-endpoints";
import type { SimulatorState } from "@/types/simulador";

export function startSimulator(): Promise<SimulatorState> {
  return bffRequest<SimulatorState>(`${NEXT_PROXY.simulator}/session`, { method: "POST" });
}

export function fetchConversation(after: number): Promise<SimulatorState> {
  return bffRequest<SimulatorState>(`${NEXT_PROXY.simulator}/conversation?after=${after}`);
}

/** Mensagem do corretor para o bot: texto e/ou um arquivo (foto ou PDF). */
export function sendAgentMessage(text: string, file?: File | null): Promise<unknown> {
  if (!file) return bffRequest(`${NEXT_PROXY.simulator}/agent`, jsonInit("POST", { text }));
  const form = new FormData();
  form.append("text", text);
  form.append("file", file, file.name);
  return bffRequest(`${NEXT_PROXY.simulator}/agent`, { method: "POST", body: form });
}

export function sendContactMessage(contactId: string, text: string): Promise<unknown> {
  return bffRequest(`${NEXT_PROXY.simulator}/contacts/${encodeURIComponent(contactId)}/messages`, jsonInit("POST", { text }));
}

export function resetSimulator(): Promise<{ removedCampaigns: number }> {
  return bffRequest(`${NEXT_PROXY.simulator}/reset`, { method: "POST" });
}
