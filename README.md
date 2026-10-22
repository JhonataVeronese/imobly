# ImobZap — POC

SaaS multi-tenant de divulgação de imóveis via WhatsApp. O corretor posta texto, fotos e PDF num grupo privado, recebe um resumo com o público estimado e responde **CONFIRMAR**. O sistema envia para os contatos com consentimento e acompanha a entrega.

Esta POC cobre a **Fase 0** (ferramenta de validação da Z-API real) e o núcleo da **Fase 1**: base multi-tenant, consentimento/descadastro e processamento durável e idempotente de campanhas. Detalhes em [docs/ARQUITETURA.md](docs/ARQUITETURA.md) e [docs/FASE0-VALIDACAO.md](docs/FASE0-VALIDACAO.md).

## Stack

TypeScript (strict) · Node 20+ · Fastify 5 · PostgreSQL 16 + Prisma 6 (migrations versionadas) · BullMQ + Redis (AOF) · storage S3 ou disco local · Vitest.

Painel web em [web/](web/README.md): Next.js 16 + Tailwind no modelo `saas-template-web` (padrão BFF; o navegador nunca fala direto com a API).

| Processo | Porta | Papel |
|---|---|---|
| `src/main.ts` (API) | 3000 | API REST + webhooks dos provedores |
| `src/worker.ts` | — | filas de envio, entrada e reconciliação |
| `web/` (Next.js) | 3003 | painel; acessa a API só pelo servidor |

## Rodando localmente

```bash
npm install
cp .env.example .env            # gere SECRETS_MASTER_KEY (comando no arquivo)
docker compose up -d            # Postgres + Redis
npm run db:deploy               # aplica as migrations
npm run db:seed                 # imobiliária demo + 503 contatos + 2º tenant

npm run dev:api                 # terminal 1 — API em http://localhost:3000
npm run dev:worker              # terminal 2 — filas de envio/entrada/manutenção

cd web && cp .env.example .env.local && npm install
npm run dev                     # terminal 3 — painel em http://localhost:3003

npm run simulate                # terminal 4 (raiz) — fluxo completo com o provedor fake
```

Painel: `corretor@demo.dev` / `demo12345`. Com `npm run simulate -- --no-confirm` a campanha fica aguardando e você confirma pelo painel. O painel é opcional: a API e o worker funcionam sozinhos (configuração inicial por `curl` e operação diária pelo WhatsApp).

O provedor **fake** responde como a Z-API (mesmo formato de webhook) e simula status. Os 4 últimos dígitos do destino ativam cenários: `0001` número inválido, `0002` timeout, `0003` erro transitório, `0004` rate limit, `0005` instância desconectada.

## Testes

```bash
npm test                        # 71 testes (unitários + integração com Postgres real)
```

Os testes de integração usam o banco `imobzap_test`, criado pelo `docker compose`. Os 16 cenários obrigatórios da seção 14 da spec estão cobertos em `tests/integration/`: webhook duplicado e inválido, remetente não autorizado, evento fora do grupo, PDF inválido/indisponível, arquivo acima do limite, contato sem consentimento e descadastrado, confirmação dupla (inclusive concorrente), timeout do provedor, rate limit, worker interrompido, status fora de ordem, falha permanente, acesso cruzado entre tenants e revogação durante a campanha.

## Fluxo pelo WhatsApp

| Corretor envia | Sistema faz |
|---|---|
| Texto do imóvel (+ fotos/PDF, em qualquer ordem) | Extrai campos (sem inventar; ausentes ficam nulos), guarda os arquivos, cria a campanha `awaiting_confirmation` e responde com o resumo e o público estimado |
| O texto de novo | Corrige o rascunho aberto |
| `CONFIRMAR` | Congela o público, enfileira um job por destinatário (idempotente) e responde com a previsão de término |
| `CANCELAR` / `STATUS` | Descarta o rascunho / mostra o andamento e a previsão |
| `PAUSAR` / `RETOMAR` | Pausa a última campanha em envio do corretor / retoma a última pausada |
| `AJUDA` | Lista os comandos |

O passo a passo para quem usa só o WhatsApp está no painel em `/manual` (página pública, sem login).

### Simulador WhatsApp (painel, `/simulador`)

Mini chat para treinar e demonstrar o fluxo sem WhatsApp real. À esquerda, o usuário logado conversa com o bot como corretor (texto, foto, PDF, comandos); à direita, o celular de cada cliente de teste mostra o que ele recebe e permite responder (`SAIR`, `VOLTAR`…).

- **Fluxo real:** cada mensagem vira um webhook no formato da Z-API ([simulator-service.ts](src/application/simulator-service.ts) → `ingestWebhook`) e segue fila de entrada → worker → comandos → campanha → fila de envio. Exige o telefone do usuário cadastrado, como no WhatsApp.
- **Número sandbox** (`provider = "simulator"`, um por tenant, criado na primeira visita): a saída reaproveita o provedor fake (status simulados, final `0001` = sem WhatsApp) e grava a conversa numa lista do Redis lida pela tela.
- **Isolamento** ([domain/sandbox.ts](src/domain/sandbox.ts)): campanhas do sandbox só alcançam os 5 contatos de teste (`source = "simulador"`), campanhas reais nunca os alcançam, o sandbox não é escolhido como número padrão, não consome o limite do plano, e comandos/rascunhos ficam presos ao canal de onde vieram (`CONFIRMAR` no simulador nunca confirma campanha real).
- **Ritmo de demonstração** só no sandbox: 2–4 s entre clientes, pausa de 12 s a cada 3, sem janela de horário.
- **Limpar simulação** apaga conversa, campanhas, imóveis e contatos de teste do sandbox.

### Envio em fila (proteção do número)

Cada número de WhatsApp (conta do provedor) tem a própria fila BullMQ (`campaign-send-<accountId>`), processada um destinatário por vez. Antes de cada destinatário o worker reserva a vez do número no Redis ([domain/send-pacing.ts](src/domain/send-pacing.ts) + [redis-pacer.ts](src/infra/queue/redis-pacer.ts)), com compare-and-set para valer entre vários processos. Padrões (`SEND_*` no `.env`):

| Regra | Padrão |
|---|---|
| Intervalo entre destinatários | 20 s + variação de 0 a 20 s |
| Pausa de lote | 10 min a cada 40 destinatários |
| Janela | 8h às 20h, `America/Sao_Paulo` |
| Teto diário por número | 300 |
| Entre partes da mesma mensagem (foto, depois PDF) | 3 s |

Esperas longas (pausa de lote, fora da janela, teto atingido) não seguram o processo: a fila do número fica em `rateLimit` até a próxima vaga e o job volta para a espera sem gastar tentativa nem alterar o banco. Só quem vai realmente receber consome vaga (descadastrados e campanhas pausadas/canceladas são descartados antes), e o estado da campanha é revalidado depois da espera.

Contatos que respondem `SAIR`, `PARAR`, `PARE`, `STOP` etc. entram na lista de supressão e os envios pendentes deles são cancelados. `VOLTAR` reativa por pedido explícito do próprio contato, com a mensagem como evidência.

## API

Todas as rotas, exceto webhooks e auth, exigem `Authorization: Bearer <jwt>`. O tenant vem sempre do token, nunca da URL ou do corpo.

```
POST /webhooks/:provider/:token        POST /auth/register · /auth/login · GET /me · GET|POST /users
GET|POST /provider-accounts            PATCH /provider-accounts/:id · POST /provider-accounts/:id/rotate-webhook
GET /webhook-events                    (diagnóstico: payloads brutos)
GET|POST /contacts                     POST /contacts/import (text/csv) · PATCH /contacts/:id
GET /contacts/:id/consents             POST /contacts/:id/consent · POST /contacts/:id/opt-out
GET /suppression-list                  GET /audit-logs
GET|POST /properties                   GET|PATCH /properties/:id · POST /properties/:id/assets (multipart)
DELETE /properties/:id/assets/:assetId
GET|POST /campaigns                    GET /campaigns/:id (com métricas) · GET /campaigns/:id/recipients
POST /campaigns/:id/confirm | pause | resume | cancel
```

## Fora do escopo desta POC

Cobrança e planos (só há o limite mensal por tenant), agendamento (`scheduled` existe no modelo, mas não há agendador), templates aprovados da Meta, IA, geração de PDF e rate limit por tenant. Também ficaram de fora: política de retenção automática, painel de métricas operacionais (hoje são logs estruturados + contadores do worker) e documentação OpenAPI.
