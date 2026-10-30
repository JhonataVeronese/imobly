import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../../src/http/auth.js";
import { buildServer } from "../../src/http/server.js";
import { db, makeDeps, resetDb, type TestDeps } from "../helpers.js";

let app: FastifyInstance;
let deps: TestDeps;

type Call = (method: "GET" | "POST" | "PATCH", url: string, payload?: unknown, contentType?: string) => Promise<LightMyRequestResponse>;

beforeAll(async () => {
  deps = makeDeps();
  app = await buildServer(deps, { jwtSecret: "x".repeat(40) });
});
beforeEach(() => resetDb());
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

function as(token: string): Call {
  return (method, url, payload, contentType) =>
    app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}`, ...(contentType ? { "content-type": contentType } : {}) },
      payload: payload as string,
    });
}

async function login(email: string, password: string) {
  return app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
}

async function platformAdmin(): Promise<Call> {
  await db.user.create({
    data: { tenantId: null, name: "Admin", email: "admin@t.dev", passwordHash: await hashPassword("senha-admin-123"), role: "platform_admin" },
  });
  const r = await login("admin@t.dev", "senha-admin-123");
  expect(r.statusCode).toBe(200);
  expect(r.json()).toMatchObject({ tenantId: null, role: "platform_admin" });
  return as(r.json().token);
}

/** O administrador cadastra a imobiliária com o primeiro corretor; o corretor entra com a própria senha. */
async function createClient(admin: Call, name: string) {
  const r = await admin("POST", "/admin/tenants", {
    name,
    user: { name: "Corretor", email: `${name.toLowerCase()}@t.dev`, password: "senha-forte-123", phone: "11988887777" },
  });
  expect(r.statusCode).toBe(201);
  const tenantId = r.json().id as string;
  const l = await login(`${name.toLowerCase()}@t.dev`, "senha-forte-123");
  expect(l.statusCode).toBe(200);
  return { tenantId, agent: as(l.json().token) };
}

describe("API e isolamento multi-tenant", () => {
  it("exige autenticação", async () => {
    expect((await app.inject({ method: "GET", url: "/contacts" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/contacts", headers: { authorization: "Bearer forjado" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/admin/tenants" })).statusCode).toBe(401);
  });

  it("cadastro público de organização não existe mais", async () => {
    const r = await app.inject({ method: "POST", url: "/auth/register", payload: { tenantName: "X", name: "X", email: "x@t.dev", password: "senha-forte-123" } });
    expect(r.statusCode).toBe(404);
  });

  it("uma organização não acessa dados de outra", async () => {
    const admin = await platformAdmin();
    const { tenantId: alfaId, agent: a } = await createClient(admin, "Alfa");
    const { agent: b } = await createClient(admin, "Beta");

    const csv = "nome;telefone;tags;consent;consent_source;consent_evidence\nAna;11911112222;vip;sim;form site;lead#1\nBruno;11933334444;;sim;;\n";
    const imp = await a("POST", "/contacts/import?fileName=base.csv", csv, "text/csv");
    expect(imp.statusCode).toBe(200);
    expect(imp.json()).toMatchObject({ created: 2, consentsRecorded: 1 });
    expect(imp.json().invalid[0].reason).toMatch(/sem consent_source/);

    expect((await admin("POST", `/admin/tenants/${alfaId}/provider-accounts`, { provider: "fake", inboundMode: "group", inboundChatId: "1-group" })).statusCode).toBe(201);
    const prop = (await a("POST", "/properties", { title: "Casa Alfa", description: "Casa 3 quartos", price: 500000 })).json();
    const camp = await a("POST", "/campaigns", { propertyId: prop.id });
    expect(camp.statusCode).toBe(201);
    expect(camp.json()).toMatchObject({ status: "awaiting_confirmation", eligibleCount: 1 });
    const campId = camp.json().id;

    // Beta não vê nem altera nada da Alfa
    expect((await b("GET", "/contacts")).json().total).toBe(0);
    expect((await b("GET", `/campaigns/${campId}`)).statusCode).toBe(404);
    expect((await b("POST", `/campaigns/${campId}/confirm`)).statusCode).toBe(404);
    expect((await b("POST", `/campaigns/${campId}/cancel`)).statusCode).toBe(404);
    expect((await b("GET", `/campaigns/${campId}/recipients`)).statusCode).toBe(404);
    expect((await b("PATCH", `/properties/${prop.id}`, { price: 1 })).statusCode).toBe(404);
    expect((await b("POST", "/campaigns", { propertyId: prop.id })).statusCode).toBe(404);
    const contactA = (await a("GET", "/contacts")).json().items[0];
    expect((await b("POST", `/contacts/${contactA.id}/opt-out`, {})).statusCode).toBe(404);
    expect((await b("GET", "/campaigns")).json()).toHaveLength(0);

    // Alfa confirma normalmente
    const conf = await a("POST", `/campaigns/${campId}/confirm`);
    expect(conf.statusCode).toBe(200);
    expect(conf.json().recipients).toBe(1);
    const again = await a("POST", `/campaigns/${campId}/confirm`);
    expect(again.json().alreadyConfirmed).toBe(true);
  });

  it("perfis: corretor não entra em /admin e o administrador não opera dados de cliente", async () => {
    const admin = await platformAdmin();
    const { tenantId, agent } = await createClient(admin, "Zeta");

    expect((await agent("GET", "/admin/tenants")).statusCode).toBe(403);
    expect((await agent("POST", `/admin/tenants/${tenantId}/users`, { name: "X", email: "x@t.dev", password: "senha-forte-123" })).statusCode).toBe(403);
    // Conexões e usuários não são mais geridos pelo corretor
    expect((await agent("POST", "/provider-accounts", { provider: "fake", inboundMode: "direct" })).statusCode).toBe(404);
    expect((await agent("POST", "/users", { name: "X", email: "x@t.dev", password: "senha-forte-123" })).statusCode).toBe(404);
    expect((await agent("GET", "/provider-accounts")).statusCode).toBe(200);

    expect((await admin("GET", "/contacts")).statusCode).toBe(403);
    expect((await admin("GET", "/campaigns")).statusCode).toBe(403);
    expect((await admin("GET", "/me")).json()).toMatchObject({ role: "platform_admin", tenant: null });
    expect((await agent("GET", "/me")).json()).toMatchObject({ role: "agent", tenant: { id: tenantId } });
  });

  it("administrador gerencia corretores: desativar bloqueia o login; cliente suspenso também", async () => {
    const admin = await platformAdmin();
    const { tenantId } = await createClient(admin, "Eta");

    const u = await admin("POST", `/admin/tenants/${tenantId}/users`, { name: "Bia", email: "bia@t.dev", password: "senha-forte-123", phone: "11955556666" });
    expect(u.statusCode).toBe(201);
    expect(u.json()).toMatchObject({ role: "agent", phoneE164: "+5511955556666" });
    expect((await admin("POST", `/admin/tenants/${tenantId}/users`, { name: "Dup", email: "bia@t.dev", password: "senha-forte-123" })).statusCode).toBe(409);

    expect((await login("bia@t.dev", "senha-forte-123")).statusCode).toBe(200);
    expect((await admin("PATCH", `/admin/tenants/${tenantId}/users/${u.json().id}`, { status: "disabled" })).statusCode).toBe(200);
    expect((await login("bia@t.dev", "senha-forte-123")).statusCode).toBe(401);

    expect((await admin("PATCH", `/admin/tenants/${tenantId}`, { status: "suspended" })).statusCode).toBe(200);
    expect((await login("eta@t.dev", "senha-forte-123")).statusCode).toBe(401);

    const other = await createClient(admin, "Teta");
    // Usuário de outro cliente não é alterado pela URL deste
    expect((await admin("PATCH", `/admin/tenants/${other.tenantId}/users/${u.json().id}`, { name: "Invasor" })).statusCode).toBe(404);
  });

  it("credenciais do provedor ficam cifradas e não são expostas", async () => {
    const admin = await platformAdmin();
    const { tenantId, agent } = await createClient(admin, "Gama");
    const r = await admin("POST", `/admin/tenants/${tenantId}/provider-accounts`, {
      provider: "zapi",
      instanceId: "INSTANCIA1",
      instanceToken: "TOKEN-SECRETO-123",
      clientToken: "CLIENT-SECRETO",
      inboundMode: "group",
      inboundChatId: "1203-group",
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().webhookUrl).toMatch(/\/webhooks\/zapi\/[\w-]{20,}$/);
    for (const list of [await agent("GET", "/provider-accounts"), await admin("GET", `/admin/tenants/${tenantId}/provider-accounts`)]) {
      expect(JSON.stringify(list.json())).not.toContain("TOKEN-SECRETO");
    }
    const secret = await db.secret.findFirstOrThrow();
    expect(secret.ciphertext).not.toContain("TOKEN-SECRETO");
    const acc = await db.providerAccount.findFirstOrThrow();
    expect(JSON.stringify(acc)).not.toContain(r.json().webhookUrl.split("/").pop());
  });

  it("reativação de número descadastrado exige evidência nova e fica auditada", async () => {
    const admin = await platformAdmin();
    const { tenantId, agent: a } = await createClient(admin, "Delta");
    const c = (await a("POST", "/contacts", { name: "Caio", phone: "11977778888" })).json();
    expect((await a("POST", `/contacts/${c.id}/consent`, { source: "form", evidenceReference: "ev1" })).statusCode).toBe(201);
    expect((await a("POST", `/contacts/${c.id}/opt-out`, {})).statusCode).toBe(200);
    const blocked = await a("POST", `/contacts/${c.id}/consent`, { source: "form", evidenceReference: "ev2" });
    expect(blocked.statusCode).toBe(409);
    const ok = await a("POST", `/contacts/${c.id}/consent`, { source: "form", evidenceReference: "ev3-novo-aceite", overrideSuppression: true });
    expect(ok.statusCode).toBe(201);
    const logs = (await admin("GET", `/admin/tenants/${tenantId}/audit-logs`)).json().map((l: { action: string }) => l.action);
    expect(logs).toEqual(expect.arrayContaining(["tenant.created", "consent.granted", "consent.revoked", "consent.reactivated"]));
  });
});
