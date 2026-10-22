export type AgentCommand = "confirm" | "cancel" | "status" | "pause" | "resume" | "help";
export type ContactCommand = "opt_out" | "opt_in";

const OPT_OUT = new Set(["SAIR", "PARAR", "PARE", "STOP", "DESCADASTRAR", "REMOVER", "NAO QUERO", "NAO QUERO RECEBER"]);
const OPT_IN = new Set(["VOLTAR", "QUERO RECEBER"]);

function canonical(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Comandos do corretor no canal de entrada. Exige a palavra isolada para não disparar por acaso. */
export function parseAgentCommand(text: string): AgentCommand | null {
  const c = canonical(text);
  if (c === "CONFIRMAR" || c === "CONFIRMO") return "confirm";
  if (c === "CANCELAR") return "cancel";
  if (c === "STATUS") return "status";
  if (c === "PAUSAR") return "pause";
  if (c === "RETOMAR" || c === "CONTINUAR") return "resume";
  if (c === "AJUDA" || c === "MENU" || c === "COMANDOS") return "help";
  return null;
}

/** Comandos de contatos respondendo campanhas (descadastro). */
export function parseContactCommand(text: string): ContactCommand | null {
  const c = canonical(text);
  if (OPT_OUT.has(c)) return "opt_out";
  if (OPT_IN.has(c)) return "opt_in";
  return null;
}
