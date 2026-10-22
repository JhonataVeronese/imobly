import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createCampaign } from "../../src/application/campaign-service.js";
import { processWebhookEvent } from "../../src/application/inbound-processor.js";
import { sendDraftSummary } from "../../src/application/property-intake.js";
import { processRecipient } from "../../src/application/send-recipient.js";
import { conversation, ensureSandbox, resetSandbox, sendAsAgent, sendAsContact } from "../../src/application/simulator-service.js";
import { SIMULATOR_PROVIDER } from "../../src/domain/sandbox.js";
import { MemorySimulatorLog, SimulatorInboundAdapter, SimulatorOutboundAdapter } from "../../src/infra/simulator/simulator.js";
import { createContact, createTenant, db, makeDeps, PROPERTY_TEXT, resetDb, type TestDeps } from "../helpers.js";

let deps: TestDeps;
let simLog: MemorySimulatorLog;
beforeEach(async () => {
  await resetDb();
  simLog = new MemorySimulatorLog();
  const base = makeDeps();
  deps = makeDeps({
    simulator: simLog,
    inbound: { ...base.inbound, [SIMULATOR_PROVIDER]: new SimulatorInboundAdapter() },
    outboundFor: async (account) =>
      account.provider === SIMULATOR_PROVIDER ? new SimulatorOutboundAdapter(base.fake, simLog, account.tenantId) : base.fake,
  });
  deps.fake = base.fake;
});
afterAll(() => db.$disconnect());

/** Worker de entrada + resumos (debounce) + fila de envio, como em produção. */
async function drain() {
  for (const id of deps.queue.inbound.splice(0)) await processWebhookEvent(deps, id, { attempt: 1, maxAttempts: 1 });
  for (const job of deps.queue.summaries.values()) await sendDraftSummary(deps, job);
  deps.queue.summaries.clear();
  const outcomes: string[] = [];
  for (const job of deps.queue.drainSends()) outcomes.push(await processRecipient(deps, { ...job, attempt: 1, maxAttempts: 1 }));
  return outcomes;
}

const texts = async (tenantId: string, chat: string, direction: "in" | "out" = "out") =>
  (await simLog.list(tenantId)).filter((e) => e.chat === chat && e.direction === direction).map((e) => e.text ?? `[${e.kind}]`);

describe("simulador de WhatsApp do painel", () => {
  it("exige o telefone do corretor, como no WhatsApp real", async () => {
    const t = await createTenant();
    await db.user.update({ where: { id: t.user.id }, data: { phoneE164: null } });
    await expect(ensureSandbox(deps, t.tenant.id, t.user.id)).rejects.toMatchObject({ code: "agent_phone_required" });
  });

  it("fluxo completo pelo caminho real: resumo, CONFIRMAR, envio aos contatos de teste, SAIR", async () => {
    const t = await createTenant();
    const real = await createContact(t.tenant.id); // contato real compatível: nunca recebe do simulador
    const { agentPhone } = await ensureSandbox(deps, t.tenant.id, t.user.id);

    await sendAsAgent(deps, t.tenant.id, t.user.id, PROPERTY_TEXT, null);
    await drain();
    const summary = (await texts(t.tenant.id, agentPhone)).join("\n");
    expect(summary).toContain("Imóvel recebido");
    // Ana (apto Centro), Carla (investidora) e Eva (sem preferência); Bruno quer casa, Diego até 300 mil.
    expect(summary).toContain("3 contatos elegíveis");

    await sendAsAgent(deps, t.tenant.id, t.user.id, "CONFIRMAR", null);
    const outcomes = await drain();
    expect((await texts(t.tenant.id, agentPhone)).at(-1)).toContain("na fila para 3 contatos");
    expect(outcomes.sort()).toEqual(["failed_permanent", "sent", "sent"]); // Eva: número sem WhatsApp

    const recipients = await db.campaignRecipient.findMany({ where: { tenantId: t.tenant.id }, include: { contact: true } });
    expect(recipients.map((r) => r.contact.name).sort()).toEqual(["Ana (teste)", "Carla (teste)", "Eva (teste, sem WhatsApp)"]);
    expect(recipients.some((r) => r.contactId === real.id)).toBe(false);
    expect(deps.queue.sends.size).toBe(0);

    const state = await conversation(deps, t.tenant.id, t.user.id);
    const ana = state.contacts.find((c) => c.name === "Ana (teste)")!;
    expect(state.entries.some((e) => e.chat === ana.phone && e.direction === "out" && e.text?.includes("Olá, Ana"))).toBe(true);
    expect(state.entries.some((e) => e.error === "Número sem WhatsApp")).toBe(true);
    expect(state.campaign).toMatchObject({ status: "completed", accepted: 2, failed: 1 });

    await sendAsContact(deps, t.tenant.id, t.user.id, ana.id, "SAIR");
    await drain();
    expect((await texts(t.tenant.id, ana.phone)).at(-1)).toContain("não receberá mais");
    expect((await conversation(deps, t.tenant.id, t.user.id)).contacts.find((c) => c.id === ana.id)!.canReceive).toBe(false);
  });

  it("isolamento: comandos do simulador não tocam campanhas reais e campanhas reais ignoram contatos de teste", async () => {
    const t = await createTenant();
    await createContact(t.tenant.id);
    await ensureSandbox(deps, t.tenant.id, t.user.id);
    const property = await db.property.create({ data: { tenantId: t.tenant.id, title: "Apto", description: "Apto", status: "draft" } });
    const realCampaign = await createCampaign(deps, t.tenant.id, { propertyId: property.id }, { type: "user", id: t.user.id });
    expect(realCampaign.providerAccountId).toBe(t.account.id); // nunca o número do simulador por padrão
    expect(realCampaign.eligibleCount).toBe(1); // só o contato real

    await sendAsAgent(deps, t.tenant.id, t.user.id, "CONFIRMAR", null);
    await drain();
    expect((await db.campaign.findUniqueOrThrow({ where: { id: realCampaign.id } })).status).toBe("awaiting_confirmation");

    await resetSandbox(deps, t.tenant.id);
    expect(await db.contact.count({ where: { tenantId: t.tenant.id } })).toBe(1);
    expect(await db.campaign.findUnique({ where: { id: realCampaign.id } })).not.toBeNull();
    expect(await simLog.list(t.tenant.id)).toHaveLength(0);
  });
});
