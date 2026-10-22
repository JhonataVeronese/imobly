/**
 * FASE 0 — Prova de viabilidade da Z-API (contra a instância REAL).
 * Independente do restante do sistema: serve para validar as premissas antes do MVP.
 *
 * Variáveis: ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN, ZAPI_CLIENT_TOKEN (opcional), ZAPI_BASE_URL (opcional)
 *
 *   npm run probe:zapi -- capture [--port 4020]
 *       Sobe um receptor de webhooks que grava cada payload bruto em data/probe/.
 *       Exponha com um túnel HTTPS (a Z-API exige HTTPS), ex.: cloudflared tunnel --url http://localhost:4020
 *       e configure a URL nos webhooks "Ao receber" e "Status da mensagem" da instância.
 *
 *   npm run probe:zapi -- send-text --phone 5511999999999 --text "teste"
 *   npm run probe:zapi -- send-pdf  --phone 5511999999999 --url https://.../ficha.pdf [--name "Ficha"]
 *   npm run probe:zapi -- send-image --phone 5511999999999 --url https://.../foto.jpg [--caption "..."]
 *       Envia e registra a resposta (messageId/zaapId) em data/probe/sent.jsonl.
 *
 *   npm run probe:zapi -- report
 *       Analisa o que foi capturado e responde ao checklist de docs/FASE0-VALIDACAO.md.
 */
import "../src/load-env.js";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { ZapiOutboundAdapter } from "../src/infra/zapi/zapi-outbound.js";
import { ProviderError } from "../src/ports/outbound.js";

const DIR = "data/probe";
mkdirSync(DIR, { recursive: true });
const [cmd, ...rest] = process.argv.slice(2);
const arg = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};

function adapter() {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const instanceToken = process.env.ZAPI_INSTANCE_TOKEN;
  if (!instanceId || !instanceToken) throw new Error("Defina ZAPI_INSTANCE_ID e ZAPI_INSTANCE_TOKEN");
  return new ZapiOutboundAdapter(
    { instanceId, instanceToken, clientToken: process.env.ZAPI_CLIENT_TOKEN },
    process.env.ZAPI_BASE_URL ?? "https://api.z-api.io",
    30_000,
  );
}

async function send(content: Parameters<ZapiOutboundAdapter["send"]>[1]) {
  const phone = arg("phone");
  if (!phone) throw new Error("--phone obrigatório (ex.: 5511999999999 ou id do grupo)");
  const started = Date.now();
  try {
    const r = await adapter().send(phone, content);
    const rec = { at: new Date().toISOString(), phone, kind: content.kind, providerMessageId: r.providerMessageId, ms: Date.now() - started };
    appendFileSync(join(DIR, "sent.jsonl"), JSON.stringify(rec) + "\n");
    console.log("OK", rec);
  } catch (err) {
    if (err instanceof ProviderError) console.error(`ERRO [${err.kind}/${err.code}] ${err.message}`);
    else throw err;
    process.exitCode = 1;
  }
}

function summarize(p: Record<string, unknown>) {
  const img = p.image as Record<string, unknown> | undefined;
  const doc = p.document as Record<string, unknown> | undefined;
  return {
    type: p.type,
    messageId: p.messageId,
    ids: p.ids,
    status: p.status,
    isGroup: p.isGroup,
    phone: p.phone,
    participantPhone: p.participantPhone,
    participantLid: p.participantLid,
    fromMe: p.fromMe,
    text: (p.text as { message?: string } | undefined)?.message?.slice(0, 60),
    imageUrl: img?.imageUrl,
    documentUrl: doc?.documentUrl,
    documentMime: doc?.mimeType,
  };
}

if (cmd === "capture") {
  const port = Number(arg("port") ?? 4020);
  createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
      try {
        const p = JSON.parse(body) as Record<string, unknown>;
        const file = join(DIR, `${Date.now()}-${String(p.type ?? "unknown")}.json`);
        writeFileSync(file, JSON.stringify({ receivedAt: new Date().toISOString(), path: req.url, headers: req.headers, payload: p }, null, 2));
        console.log(JSON.stringify(summarize(p)));
      } catch {
        console.log("payload não-JSON:", body.slice(0, 200));
      }
    });
  }).listen(port, () => console.log(`Capturando webhooks em http://localhost:${port} → ${DIR}/`));
} else if (cmd === "send-text") {
  await send({ kind: "text", text: arg("text") ?? "Teste ImobZap — Fase 0" });
} else if (cmd === "send-pdf") {
  const url = arg("url");
  if (!url) throw new Error("--url obrigatório");
  await send({ kind: "document", extension: "pdf", fileName: arg("name") ?? "Ficha do imóvel", media: { mimeType: "application/pdf", url } });
} else if (cmd === "send-image") {
  const url = arg("url");
  if (!url) throw new Error("--url obrigatório");
  await send({ kind: "image", caption: arg("caption"), media: { mimeType: "image/jpeg", url } });
} else if (cmd === "report") {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));
  const events = files.map((f) => (JSON.parse(readFileSync(join(DIR, f), "utf8")) as { payload: Record<string, unknown> }).payload);
  const sent = (() => {
    try {
      return readFileSync(join(DIR, "sent.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as { providerMessageId: string });
    } catch {
      return [];
    }
  })();
  const received = events.filter((e) => e.type === "ReceivedCallback");
  const groupMsgs = received.filter((e) => e.isGroup && !e.fromMe);
  const statuses = events.filter((e) => e.type === "MessageStatusCallback");
  const sentIds = new Set(sent.map((s) => s.providerMessageId));
  const statusIds = statuses.flatMap((s) => (s.ids as string[]) ?? []);
  const check = (ok: boolean | null, label: string, detail = "") => console.log(`${ok === null ? "  ?" : ok ? " OK" : "  X"}  ${label}${detail ? ` — ${detail}` : ""}`);

  console.log(`Eventos capturados: ${events.length} (${received.length} mensagens, ${statuses.length} status) · envios registrados: ${sent.length}\n`);
  check(groupMsgs.length ? true : null, "Mensagens de grupo chegam pelo webhook", `${groupMsgs.length} recebidas`);
  check(groupMsgs.length ? groupMsgs.every((g) => typeof g.participantPhone === "string" && g.participantPhone) : null, "Grupo identifica o remetente (participantPhone)",
    groupMsgs.filter((g) => !g.participantPhone).length ? `${groupMsgs.filter((g) => !g.participantPhone).length} sem participantPhone (verificar participantLid)` : "");
  check(received.some((e) => e.image) ? true : null, "Imagens chegam com imageUrl");
  check(received.some((e) => e.document) ? true : null, "PDFs chegam com documentUrl");
  check(received.some((e) => e.fromMe) ? true : null, "Mensagens fromMe são notificadas (atenção a loops se o corretor usar o mesmo número)");
  check(statuses.length ? true : null, "Webhooks de status chegam", [...new Set(statuses.map((s) => s.status))].join(", "));
  check(sent.length && statusIds.length ? statusIds.some((id) => sentIds.has(id)) : null, "ids do status correspondem ao messageId retornado no envio");
  console.log("\nURLs de mídia recebidas (teste o download e por quanto tempo ficam válidas):");
  for (const e of received) {
    const u = (e.image as { imageUrl?: string })?.imageUrl ?? (e.document as { documentUrl?: string })?.documentUrl;
    if (u) console.log("  ", u);
  }
} else {
  console.log("Comandos: capture | send-text | send-pdf | send-image | report (veja o cabeçalho do arquivo)");
}
