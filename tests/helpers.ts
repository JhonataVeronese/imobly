import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AppDeps } from "../src/application/deps.js";
import { generateWebhookToken } from "../src/application/webhook-intake.js";
import { RegexPropertyExtractor } from "../src/domain/property-parser.js";
import { DomainError } from "../src/domain/errors.js";
import { FakeOutboundAdapter } from "../src/infra/fake/fake-outbound.js";
import { MemoryQueue } from "../src/infra/queue/bullmq-queue.js";
import { EncryptedDbSecrets } from "../src/infra/secrets/db-secrets.js";
import { MemoryStorage } from "../src/infra/storage/storage.js";
import { ZapiInboundAdapter } from "../src/infra/zapi/zapi-inbound.js";

const testUrl = process.env.TEST_DATABASE_URL ?? "postgresql://imobzap:imobzap@127.0.0.1:5432/imobzap_test?schema=public";
export const db = new PrismaClient({ datasources: { db: { url: testUrl } } });

export const silentLogger = { info() {}, warn() {}, error() {}, debug() {} };

export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
export const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);
export const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "latin1");

export interface TestDeps extends AppDeps {
  queue: MemoryQueue;
  storage: MemoryStorage;
  fake: FakeOutboundAdapter;
  media: Map<string, Buffer>;
}

export function makeDeps(overrides: Partial<AppDeps> = {}): TestDeps {
  const fake = new FakeOutboundAdapter();
  const media = new Map<string, Buffer>();
  const deps = {
    db,
    queue: new MemoryQueue(),
    storage: new MemoryStorage(),
    secrets: new EncryptedDbSecrets(db, randomBytes(32).toString("base64")),
    inbound: { zapi: new ZapiInboundAdapter() },
    outboundFor: async () => fake,
    extractor: new RegexPropertyExtractor(),
    fetchMedia: async (url: string) => {
      const b = media.get(url);
      if (!b) throw new DomainError("file_unavailable", "Arquivo indisponível (HTTP 404)");
      return b;
    },
    config: {
      MAX_IMAGE_BYTES: 1024,
      MAX_DOCUMENT_BYTES: 4096,
      ASSET_DELIVERY: "base64" as const,
      ASSET_URL_TTL_SECONDS: 600,
      SEND_MAX_ATTEMPTS: 3,
      PUBLIC_BASE_URL: "http://test",
    },
    logger: silentLogger,
    now: () => new Date(),
    fake,
    media,
    ...overrides,
  };
  return deps as TestDeps;
}

export async function resetDb() {
  await db.$executeRawUnsafe(
    `TRUNCATE recipient_messages, campaign_recipients, campaigns, property_assets, properties, contact_consents,
     suppression_list, contacts, webhook_events, provider_accounts, secrets, audit_logs, users, tenants CASCADE`,
  );
}

export const AGENT_PHONE = "+5511988887777";
export const GROUP_ID = "120363000000000001-group";

export async function createTenant(name = "Imob Teste", opts: { instanceId?: string; inboundMode?: "group" | "direct" } = {}) {
  const tenant = await db.tenant.create({ data: { name } });
  const user = await db.user.create({
    data: {
      tenantId: tenant.id,
      name: "Corretor",
      email: `${tenant.id}@test.dev`,
      passwordHash: "x",
      role: "agent",
      phoneE164: AGENT_PHONE,
    },
  });
  const { token, hash } = generateWebhookToken();
  const account = await db.providerAccount.create({
    data: {
      tenantId: tenant.id,
      provider: "zapi",
      accountReference: opts.instanceId ?? `inst-${tenant.id.slice(0, 8)}`,
      inboundMode: opts.inboundMode ?? "group",
      inboundChatId: GROUP_ID,
      webhookTokenHash: hash,
    },
  });
  return { tenant, user, account, webhookToken: token };
}

let phoneSeq = 1000;
export async function createContact(
  tenantId: string,
  o: { consent?: boolean; phone?: string; preferences?: object; tags?: string[]; name?: string } = {},
) {
  const phone = o.phone ?? `+55119${String(70000000 + phoneSeq++).padStart(8, "0")}`;
  const c = await db.contact.create({
    data: { tenantId, name: o.name ?? "Maria Silva", phoneE164: phone, preferences: o.preferences ?? {}, tags: o.tags ?? [] },
  });
  if (o.consent !== false) {
    await db.contactConsent.create({
      data: { tenantId, contactId: c.id, source: "formulario_site", evidenceReference: "form#123", grantedAt: new Date() },
    });
  }
  return c;
}

let msgSeq = 0;
/** Payload no formato ReceivedCallback da Z-API. */
export function zapiMessage(
  instanceId: string,
  o: {
    text?: string;
    image?: string;
    document?: { url: string; fileName?: string };
    group?: boolean;
    chatId?: string;
    from?: string;
    fromMe?: boolean;
    messageId?: string;
    /** Cartões de contato ("Enviar contato"), no formato da Z-API. */
    contacts?: { name: string; phone: string }[];
  },
) {
  const group = o.group ?? true;
  const from = (o.from ?? AGENT_PHONE).replace(/\D/g, "");
  return {
    type: "ReceivedCallback",
    instanceId,
    messageId: o.messageId ?? `MSG${++msgSeq}${Date.now()}`,
    phone: o.chatId ?? (group ? GROUP_ID : from),
    fromMe: o.fromMe ?? false,
    isGroup: group,
    momment: Date.now(),
    participantPhone: group ? from : null,
    senderName: "Corretor",
    ...(o.text ? { text: { message: o.text } } : {}),
    ...(o.image ? { image: { imageUrl: o.image, mimeType: "image/png", caption: null } } : {}),
    ...(o.contacts?.length === 1
      ? { contact: vcardOf(o.contacts[0]!) }
      : o.contacts?.length
        ? { contacts: o.contacts.map(vcardOf) }
        : {}),
    ...(o.document ? { document: { documentUrl: o.document.url, mimeType: "application/pdf", fileName: o.document.fileName ?? "ficha.pdf" } } : {}),
  };
}

function vcardOf(c: { name: string; phone: string }) {
  const d = c.phone.replace(/\D/g, "");
  return {
    displayName: c.name,
    vCard: ["BEGIN:VCARD", "VERSION:3.0", `N:;${c.name};;;`, `FN:${c.name}`, `TEL;type=CELL;waid=${d}:+${d}`, "END:VCARD"].join("\n"),
  };
}

export function zapiStatus(instanceId: string, ids: string[], status: string) {
  return { type: "MessageStatusCallback", instanceId, status, ids, momment: Date.now(), phone: "5511999999999", isGroup: false };
}

export const PROPERTY_TEXT = `Apartamento à venda no Centro

3 quartos, 1 suíte, 2 vagas.

Valor: R$ 450.000.

Aceita financiamento.

Público: clientes interessados em apartamentos de dois ou três quartos.`;
