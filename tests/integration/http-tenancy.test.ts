import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../../src/http/server.js";
import { db, makeDeps, resetDb, type TestDeps } from "../helpers.js";

let app: FastifyInstance;
let deps: TestDeps;

beforeAll(async () => {
  deps = makeDeps();
  app = await buildServer(deps, { jwtSecret: "x".repeat(40) });
});
beforeEach(() => resetDb());
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

async function register(name: string) {
  const r = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { tenantName: name, name: "Dono", email: `${name.toLowerCase()}@t.dev`, password: "senha-forte-123", phone: "11988887777" },
  });
  expect(r.statusCode).toBe(201);
  const token = r.json().token as string;
  return (method: "GET" | "POST" | "PATCH", url: string, payload?: unknown, contentType?: string) =>
    app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}`, ...(contentType ? { "content-type": contentType } : {}) },
      payload: payload as string,
    });
}

describe("API e isolamento multi-tenant", () => {
  it("exige autenticação", async () => {
    expect((await app.inject({ method: "GET", url: "/contacts" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/contacts", headers: { authorization: "Bearer forjado" } })).statusCode).toBe(401);
  });

  it("uma organização não acessa dados de outra", async () => {
    const a = await register("Alfa");
    const b = await register("Beta");

    const csv = "nome;telefone;tags;consent;consent_source;consent_evidence\nAna;11911112222;vip;sim;form site;lead#1\nBruno;11933334444;;sim;;\n";
    const imp = await a("POST", "/contacts/import?fileName=base.csv", csv, "text/csv");
    expect(imp.statusCode).toBe(200);
    expect(imp.json()).toMatchObject({ created: 2, consentsRecorded: 1 });
    expect(imp.json().invalid[0].reason).toMatch(/sem consent_source/);

    await a("POST", "/provider-accounts", { provider: "fake", inboundMode: "group", inboundChatId: "1-group" });
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

  it("credenciais do provedor ficam cifradas e não são expostas", async () => {
    const a = await register("Gama");
    const r = await a("POST", "/provider-accounts", {
      provider: "zapi",
      instanceId: "INSTANCIA1",
      instanceToken: "TOKEN-SECRETO-123",
      clientToken: "CLIENT-SECRETO",
      inboundMode: "group",
      inboundChatId: "1203-group",
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().webhookUrl).toMatch(/\/webhooks\/zapi\/[\w-]{20,}$/);
    const list = await a("GET", "/provider-accounts");
    expect(JSON.stringify(list.json())).not.toContain("TOKEN-SECRETO");
    const secret = await db.secret.findFirstOrThrow();
    expect(secret.ciphertext).not.toContain("TOKEN-SECRETO");
    const acc = await db.providerAccount.findFirstOrThrow();
    expect(JSON.stringify(acc)).not.toContain(r.json().webhookUrl.split("/").pop());
  });

  it("reativação de número descadastrado exige admin + evidência", async () => {
    const a = await register("Delta");
    const c = (await a("POST", "/contacts", { name: "Caio", phone: "11977778888" })).json();
    expect((await a("POST", `/contacts/${c.id}/consent`, { source: "form", evidenceReference: "ev1" })).statusCode).toBe(201);
    expect((await a("POST", `/contacts/${c.id}/opt-out`, {})).statusCode).toBe(200);
    const blocked = await a("POST", `/contacts/${c.id}/consent`, { source: "form", evidenceReference: "ev2" });
    expect(blocked.statusCode).toBe(409);
    const ok = await a("POST", `/contacts/${c.id}/consent`, { source: "form", evidenceReference: "ev3-novo-aceite", overrideSuppression: true });
    expect(ok.statusCode).toBe(201);
    const logs = (await a("GET", "/audit-logs")).json().map((l: { action: string }) => l.action);
    expect(logs).toEqual(expect.arrayContaining(["consent.granted", "consent.revoked", "consent.reactivated"]));
  });
});
