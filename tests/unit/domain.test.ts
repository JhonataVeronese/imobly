import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isCompatibleWithProperty, matchesAudience } from "../../src/domain/audience.js";
import { allowedSources, assertTransition, canTransition } from "../../src/domain/campaign.js";
import { parseAgentCommand, parseContactCommand } from "../../src/domain/commands.js";
import { sniffMime, validateFile } from "../../src/domain/file-validation.js";
import { aggregateParts, applyProviderStatus } from "../../src/domain/message-status.js";
import { normalizePhoneE164, phoneMatchKey } from "../../src/domain/phone.js";
import { extractProperty, looksLikeProperty } from "../../src/domain/property-parser.js";
import { renderTemplate, validateTemplate } from "../../src/domain/template.js";
import { JPEG, PDF, PNG, PROPERTY_TEXT } from "../helpers.js";

describe("estados da campanha", () => {
  it("permite apenas transições explícitas", () => {
    expect(canTransition("awaiting_confirmation", "processing")).toBe(true);
    expect(canTransition("processing", "paused")).toBe(true);
    expect(canTransition("paused", "processing")).toBe(true);
    expect(canTransition("completed", "processing")).toBe(false);
    expect(canTransition("cancelled", "processing")).toBe(false);
    expect(canTransition("draft", "processing")).toBe(false);
    expect(() => assertTransition("completed", "cancelled")).toThrow(/não pode/);
  });
  it("calcula origens válidas para compare-and-set", () => {
    expect(allowedSources("paused").sort()).toEqual(["processing", "scheduled"]);
    expect(allowedSources("cancelled")).not.toContain("completed");
  });
});

describe("status de mensagem", () => {
  it("não regride com eventos fora de ordem", () => {
    expect(applyProviderStatus("read", "delivered")).toBe("read");
    expect(applyProviderStatus("accepted", "read")).toBe("read");
    expect(applyProviderStatus("delivered", "sent")).toBe("delivered");
  });
  it("unknown pode avançar quando o provedor confirma", () => {
    expect(applyProviderStatus("unknown", "delivered")).toBe("delivered");
  });
  it("falha depois de entregue é ignorada; cancelado é final", () => {
    expect(applyProviderStatus("delivered", "failed")).toBe("delivered");
    expect(applyProviderStatus("accepted", "failed")).toBe("failed");
    expect(applyProviderStatus("cancelled", "read")).toBe("cancelled");
  });
  it("agrega partes pelo menor progresso", () => {
    expect(aggregateParts(["read", "delivered"])).toBe("delivered");
    expect(aggregateParts(["read", "failed"])).toBe("failed");
    expect(aggregateParts(["accepted", "unknown"])).toBe("unknown");
  });
});

describe("telefones", () => {
  it("normaliza para E.164", () => {
    expect(normalizePhoneE164("(11) 98888-7777")).toBe("+5511988887777");
    expect(normalizePhoneE164("+55 11 98888-7777")).toBe("+5511988887777");
    expect(normalizePhoneE164("5511988887777")).toBe("+5511988887777");
    expect(normalizePhoneE164("123")).toBeNull();
    expect(normalizePhoneE164("+55 11 1234")).toBeNull();
  });
  it("casa números com e sem o 9º dígito", () => {
    expect(phoneMatchKey("+5511988887777")).toBe(phoneMatchKey("551188887777"));
  });
});

describe("extração de imóvel (sem IA)", () => {
  it("extrai os campos do exemplo da spec", () => {
    const e = extractProperty(PROPERTY_TEXT);
    expect(e).toMatchObject({
      title: "Apartamento à venda no Centro",
      propertyType: "apartamento",
      transaction: "venda",
      price: 450000,
      neighborhood: "Centro",
      bedrooms: 3,
      suites: 1,
      parkingSpaces: 2,
    });
    expect(e.audienceHint).toMatch(/dois ou três quartos/);
    expect(looksLikeProperty(e)).toBe(true);
  });
  it("não inventa campos ausentes", () => {
    const e = extractProperty("Casa com quintal, aceita permuta");
    expect(e.price).toBeNull();
    expect(e.bedrooms).toBeNull();
    expect(e.city).toBeNull();
    expect(e.areaM2).toBeNull();
  });
  it("entende 'mil' e 'milhão' e área", () => {
    expect(extractProperty("Casa 120m² por R$ 1,2 milhão").price).toBe(1_200_000);
    expect(extractProperty("Terreno R$ 380 mil").price).toBe(380_000);
    expect(extractProperty("Casa 120m² por R$ 1,2 milhão").areaM2).toBe(120);
  });
  it("anúncio real de lançamento com duas plantas (Balla Città)", () => {
    const text = readFileSync(new URL("../fixtures/anuncio-balla-citta.txt", import.meta.url), "utf8");
    const e = extractProperty(text);
    expect(e).toMatchObject({
      title: "BALLA CITTÁ",
      propertyType: "apartamento",
      price: 370_000, // "a partir de": menor valor
      areaM2: 55,
      bedrooms: 2, // maior planta, para não excluir quem busca 2 quartos
      suites: 1,
      neighborhood: "Canadá",
      city: null, // não informado — não deduzimos pelo DDD
      parkingSpaces: null, // "vaga de garagem" sem quantidade
    });
    expect(e.units).toEqual([
      { bedrooms: 1, suites: 1, areaM2: 55, price: 370_000 },
      { bedrooms: 2, suites: 1, areaM2: 65, price: 385_000 },
    ]);
    expect(looksLikeProperty(e)).toBe(true);
    // Contato que quer 2 quartos até R$ 400 mil entra no público
    expect(isCompatibleWithProperty({ bedroomsMin: 2, priceMax: 400_000 }, { propertyType: e.propertyType, price: e.price, bedrooms: e.bedrooms })).toBe(true);
  });
  it("conversa comum não parece imóvel", () => {
    expect(looksLikeProperty(extractProperty("bom dia, tudo bem?"))).toBe(false);
  });
});

describe("comandos", () => {
  it("reconhece descadastro com variações", () => {
    for (const t of ["SAIR", "sair", " Parar! ", "pare", "Não quero"]) expect(parseContactCommand(t)).toBe("opt_out");
    expect(parseContactCommand("quero sair do grupo da família")).toBeNull();
  });
  it("comandos do corretor exigem palavra isolada", () => {
    expect(parseAgentCommand("confirmar")).toBe("confirm");
    expect(parseAgentCommand("vou confirmar amanhã")).toBeNull();
  });
  it("pausar, retomar e ajuda", () => {
    expect(parseAgentCommand("Pausar")).toBe("pause");
    expect(parseAgentCommand("retomar!")).toBe("resume");
    expect(parseAgentCommand("continuar")).toBe("resume");
    expect(parseAgentCommand("ajuda")).toBe("help");
    expect(parseAgentCommand("pausar o envio de hoje")).toBeNull();
  });
});

describe("validação de arquivos", () => {
  const limits = { maxImageBytes: 1024, maxDocumentBytes: 4096 };
  it("detecta o tipo real pelo conteúdo", () => {
    expect(sniffMime(PNG)).toBe("image/png");
    expect(sniffMime(JPEG)).toBe("image/jpeg");
    expect(sniffMime(PDF)).toBe("application/pdf");
    expect(sniffMime(Buffer.from("MZ executável"))).toBeNull();
  });
  it("rejeita formato não permitido, acima do limite, vazio e PDF truncado", () => {
    expect(() => validateFile(Buffer.from("<html>"), limits)).toThrow(/Formato/);
    expect(() => validateFile(Buffer.concat([PNG, Buffer.alloc(2000)]), limits)).toThrow(/limite/);
    expect(() => validateFile(Buffer.alloc(0), limits)).toThrow(/vazio/);
    expect(() => validateFile(Buffer.from("%PDF-1.4 sem fim"), limits)).toThrow(/PDF inválido/);
    expect(validateFile(PDF, limits).kind).toBe("document");
  });
});

describe("público", () => {
  const property = { propertyType: "apartamento", city: "Campinas", neighborhood: "Centro", price: 450000, bedrooms: 3 };
  it("preferência ausente não exclui; preferência incompatível exclui", () => {
    expect(isCompatibleWithProperty({}, property)).toBe(true);
    expect(isCompatibleWithProperty({ propertyTypes: ["casa"] }, property)).toBe(false);
    expect(isCompatibleWithProperty({ priceMax: 400000 }, property)).toBe(false);
    expect(isCompatibleWithProperty({ bedroomsMin: 2, neighborhoods: ["centro"] }, property)).toBe(true);
  });
  it("aplica segmentos explícitos", () => {
    const c = { preferences: { investor: true }, tags: ["vip"] };
    expect(matchesAudience(c, { matchProperty: true, tagsAny: ["VIP"] }, property)).toBe(true);
    expect(matchesAudience(c, { matchProperty: true, tagsAny: ["frio"] }, property)).toBe(false);
    expect(matchesAudience({ preferences: {}, tags: [] }, { matchProperty: false, investorOnly: true }, property)).toBe(false);
  });
});

describe("template", () => {
  it("renderiza variáveis e não inventa as ausentes", () => {
    expect(renderTemplate("Olá, {{primeiro_nome}}! {{descricao}}", { primeiro_nome: null, descricao: "Apto" })).toBe("Olá! Apto");
  });
  it("rejeita variáveis desconhecidas", () => {
    expect(validateTemplate("Oi {{cpf}}")).toEqual(["Variável desconhecida: {{cpf}}"]);
  });
});
