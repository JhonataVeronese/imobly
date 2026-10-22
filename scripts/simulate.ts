/**
 * Simulação ponta a ponta com o provedor fake (sem WhatsApp real):
 * o "corretor" posta foto + texto + PDF no grupo → resumo → CONFIRMAR → worker envia →
 * status simulados → um contato responde SAIR.
 *
 *   npm run simulate              (fluxo completo)
 *   npm run simulate -- --no-confirm   (para em "aguardando confirmação" para confirmar pelo painel)
 *
 * Requer API (npm run dev:api) e worker (npm run dev:worker) rodando, e o seed aplicado.
 */
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const API = process.env.API_URL ?? "http://localhost:3000";
const MEDIA_PORT = 4010;
const demo = JSON.parse(readFileSync("data/demo-webhook.json", "utf8")) as {
  provider: string;
  token: string;
  instanceId: string;
  groupId: string;
  agentPhone: string;
};
const noConfirm = process.argv.includes("--no-confirm");

// PNG 1x1 válido e um PDF mínimo válido
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  "latin1",
);
const media = createServer((req, res) => {
  if (req.url === "/foto.png") return res.writeHead(200, { "content-type": "image/png" }).end(PNG);
  if (req.url === "/ficha.pdf") return res.writeHead(200, { "content-type": "application/pdf" }).end(PDF);
  res.writeHead(404).end();
});
await new Promise<void>((r) => media.listen(MEDIA_PORT, "127.0.0.1", r));

const agentDigits = demo.agentPhone.replace(/\D/g, "");
let seq = 0;
function msg(extra: Record<string, unknown>, opts: { group?: boolean; from?: string } = {}) {
  const group = opts.group ?? true;
  const from = opts.from ?? agentDigits;
  return {
    type: "ReceivedCallback",
    instanceId: demo.instanceId,
    messageId: `SIM-${Date.now()}-${++seq}`,
    phone: group ? demo.groupId : from,
    isGroup: group,
    fromMe: false,
    momment: Date.now(),
    participantPhone: group ? from : null,
    senderName: "Corretor Demo",
    ...extra,
  };
}

async function post(payload: unknown) {
  const r = await fetch(`${API}/webhooks/${demo.provider}/${demo.token}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await r.json();
  console.log(`  webhook → ${r.status} ${JSON.stringify(body)}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api<T>(path: string, token: string, method = "GET"): Promise<T> {
  const r = await fetch(`${API}${path}`, { method, headers: { authorization: `Bearer ${token}` } });
  return r.json() as Promise<T>;
}

const login = (await (
  await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "corretor@demo.dev", password: "demo12345" }),
  })
).json()) as { token: string };

console.log("1) Corretor envia foto, texto e PDF no grupo de entrada");
await post(msg({ image: { imageUrl: `http://127.0.0.1:${MEDIA_PORT}/foto.png`, mimeType: "image/png" } }));
await post(
  msg({
    text: {
      message:
        "Apartamento à venda no Centro\n\n3 quartos, 1 suíte, 2 vagas.\n\nValor: R$ 450.000.\n\nAceita financiamento.\n\n" +
        "Público: clientes interessados em apartamentos de dois ou três quartos.",
    },
  }),
);
await post(msg({ document: { documentUrl: `http://127.0.0.1:${MEDIA_PORT}/ficha.pdf`, mimeType: "application/pdf", fileName: "Ficha Apto Centro.pdf" } }));
await post(msg({ text: { message: "bom dia pessoal" } }, { from: "5521977776666" })); // remetente não autorizado
await sleep(2500);

type Campaign = { id: string; name: string; status: string; eligibleCount: number; metrics: Record<string, unknown> };
let [campaign] = await api<Campaign[]>("/campaigns", login.token);
if (!campaign) throw new Error("campanha não criada — o worker está rodando?");
console.log(`2) Campanha "${campaign.name}" → ${campaign.status}, ${campaign.eligibleCount} elegíveis`);

if (noConfirm) {
  console.log("   --no-confirm: confirme pelo painel (http://localhost:3000) ou envie CONFIRMAR.");
  media.close();
  process.exit(0);
}

console.log("3) Corretor responde CONFIRMAR (duas vezes, para provar a idempotência)");
await post(msg({ text: { message: "CONFIRMAR" } }));
await post(msg({ text: { message: "CONFIRMAR" } }));

console.log("4) Acompanhando o envio...");
for (let i = 0; i < 120; i++) {
  await sleep(2000);
  campaign = await api<Campaign>(`/campaigns/${campaign.id}`, login.token);
  const m = campaign.metrics;
  console.log(`   ${campaign.status} · fila ${m.queued} · aceitas ${m.accepted} · entregues ${m.delivered} · lidas ${m.read} · falhas ${m.failed} · desconhecidas ${m.unknown}`);
  if (campaign.status === "completed" || campaign.status === "paused") break;
}

console.log("5) Um destinatário responde SAIR");
const recips = await api<{ items: { phoneE164: string }[] }>(`/campaigns/${campaign.id}/recipients?status=delivered`, login.token);
const target = recips.items[0]?.phoneE164 ?? (await api<{ items: { phoneE164: string }[] }>(`/campaigns/${campaign.id}/recipients`, login.token)).items[0]?.phoneE164;
if (target) await post(msg({ text: { message: "SAIR" } }, { group: false, from: target.replace(/\D/g, "") }));
await sleep(4000);
campaign = await api<Campaign>(`/campaigns/${campaign.id}`, login.token);
console.log("\nResultado final:", JSON.stringify(campaign.metrics, null, 2));
media.close();
