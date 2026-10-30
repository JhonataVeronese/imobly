/**
 * Dados de demonstração: 1 imobiliária com ~500 contatos (cenário de validação da spec),
 * integração "fake" e uma segunda imobiliária para demonstrar o isolamento.
 */
import "../src/load-env.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { generateWebhookToken } from "../src/application/webhook-intake.js";
import { hashPassword } from "../src/http/auth.js";

const db = new PrismaClient();
const DEMO_EMAIL = "corretor@demo.dev";
const DEMO_PASSWORD = "demo12345";
const AGENT_PHONE = "+5511988887777";
const GROUP_ID = "120363000000000001-group";

const TYPES = ["apartamento", "casa", "terreno", "cobertura", "studio"];
const NEIGHBORHOODS = ["Centro", "Cambuí", "Taquaral", "Barão Geraldo", "Guanabara", "Nova Campinas"];
const FIRST = ["Ana", "Bruno", "Carla", "Diego", "Elisa", "Fábio", "Gabriela", "Heitor", "Isabela", "João", "Larissa", "Marcos", "Natália", "Otávio", "Paula", "Rafael", "Sofia", "Tiago", "Vanessa", "William"];
const LAST = ["Silva", "Souza", "Oliveira", "Santos", "Lima", "Pereira", "Costa", "Rodrigues", "Almeida", "Nascimento"];

let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)]!;

const ADMIN_EMAIL = "admin@demo.dev";

/** Administrador da plataforma de demonstração — nunca em produção (senha conhecida). */
async function ensureDemoPlatformAdmin() {
  if (process.env.NODE_ENV === "production") return;
  if (await db.user.findUnique({ where: { email: ADMIN_EMAIL } })) return;
  await db.user.create({
    data: { tenantId: null, name: "Administrador", email: ADMIN_EMAIL, passwordHash: await hashPassword(DEMO_PASSWORD), role: "platform_admin" },
  });
  console.log(`Administrador da plataforma: ${ADMIN_EMAIL} / ${DEMO_PASSWORD}`);
}

async function main() {
  await ensureDemoPlatformAdmin();
  const existing = await db.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    console.log("Seed já aplicado. Para recriar: docker compose down -v && docker compose up -d && npm run db:deploy && npm run db:seed");
    return;
  }

  const tenant = await db.tenant.create({ data: { name: "Imobiliária Demo", tradeName: "Demo Imóveis", contactPhone: AGENT_PHONE } });
  await db.user.create({
    data: { tenantId: tenant.id, name: "Corretor Demo", email: DEMO_EMAIL, passwordHash: await hashPassword(DEMO_PASSWORD), role: "agent", phoneE164: AGENT_PHONE },
  });
  const { token, hash } = generateWebhookToken();
  await db.providerAccount.create({
    data: { tenantId: tenant.id, provider: "fake", accountReference: "fake-demo", inboundMode: "group", inboundChatId: GROUP_ID, webhookTokenHash: hash },
  });

  let withConsent = 0;
  for (let i = 0; i < 500; i++) {
    // 0001..0005 no final ativam cenários de erro do provedor fake
    const phone = `+55199${String(81000000 + i * 7 + 10).padStart(8, "0")}`;
    const prefs: Record<string, string[] | number | boolean> = {};
    if (rnd() < 0.7) prefs.propertyTypes = [pick(TYPES), ...(rnd() < 0.4 ? [pick(TYPES)] : [])];
    if (rnd() < 0.5) prefs.neighborhoods = [pick(NEIGHBORHOODS)];
    if (rnd() < 0.6) prefs.priceMax = Math.round((200 + rnd() * 1300) / 50) * 50_000;
    if (rnd() < 0.4) prefs.bedroomsMin = 1 + Math.floor(rnd() * 3);
    if (rnd() < 0.15) prefs.investor = true;
    const contact = await db.contact.create({
      data: {
        tenantId: tenant.id,
        name: `${pick(FIRST)} ${pick(LAST)}`,
        phoneE164: phone,
        source: "seed",
        preferences: prefs,
        tags: rnd() < 0.2 ? ["vip"] : [],
      },
    });
    if (rnd() < 0.75) {
      withConsent++;
      await db.contactConsent.create({
        data: { tenantId: tenant.id, contactId: contact.id, source: "formulario_site", evidenceReference: `lead-form#${1000 + i}`, grantedAt: new Date() },
      });
    }
  }
  // Contatos especiais para demonstrar falhas tratadas pelo provedor fake
  for (const [suffix, label] of [["0001", "Número inválido"], ["0002", "Timeout"], ["0003", "Instável"]] as const) {
    const c = await db.contact.create({ data: { tenantId: tenant.id, name: `Teste ${label}`, phoneE164: `+551197777${suffix}`, source: "seed" } });
    await db.contactConsent.create({ data: { tenantId: tenant.id, contactId: c.id, source: "teste", evidenceReference: "seed", grantedAt: new Date() } });
  }

  const other = await db.tenant.create({ data: { name: "Outra Imobiliária" } });
  await db.user.create({ data: { tenantId: other.id, name: "Outro", email: "outro@demo.dev", passwordHash: await hashPassword(DEMO_PASSWORD), role: "agent" } });
  await db.contact.create({ data: { tenantId: other.id, name: "Cliente da outra", phoneE164: "+5511900001111", source: "seed" } });

  mkdirSync("data", { recursive: true });
  writeFileSync("data/demo-webhook.json", JSON.stringify({ provider: "fake", token, instanceId: "fake-demo", groupId: GROUP_ID, agentPhone: AGENT_PHONE }, null, 2));
  console.log(`Seed ok: 503 contatos (${withConsent + 3} com consentimento).`);
  console.log(`Login do painel: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log("Token do webhook demo salvo em data/demo-webhook.json (usado por npm run simulate).");
}

main().finally(() => db.$disconnect());
