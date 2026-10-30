# ImobZap — Arquitetura da POC

Responde aos itens 1–6 da seção 18 da spec: plano de módulos, limitações do provedor, esquema do banco, interfaces dos adaptadores, estados e riscos.

## 1. Módulos

```
src/
  domain/          Regras puras, sem I/O. Testadas isoladamente.
    campaign.ts        Estados e transições da campanha (compare-and-set)
    message-status.ts  Status de mensagem, ordem de progresso, agregação por partes
    audience.ts        Preferências do contato × perfil do imóvel × segmentos
    property-parser.ts Extração determinística do texto (interface PropertyExtractor para IA futura)
    commands.ts        CONFIRMAR/CANCELAR/STATUS (corretor) e SAIR/PARAR/VOLTAR (contato)
    file-validation.ts Tipo real por magic bytes, limites, PDF truncado
    phone.ts, template.ts
  ports/           Interfaces: OutboundMessagingAdapter, InboundAdapter, StoragePort, SecretsPort, QueuePort
  application/     Casos de uso (dependem só de ports + Prisma)
    webhook-intake.ts     parte síncrona do webhook: autentica, deduplica, persiste, enfileira
    inbound-processor.ts  roteia o evento: corretor, contato (descadastro) ou status
    property-intake.ts    rascunho do imóvel + anexos + resumo + comandos
    campaign-service.ts   criar, estimar público, confirmar (idempotente), pausar, retomar, cancelar, métricas
    send-recipient.ts     envio de UM destinatário, com estado por parte
    status-service.ts     aplica status (fora de ordem, CAS)
    consent-service.ts    consentimento, supressão, descadastro
    reconcile.ts          rede de segurança periódica
  infra/           Z-API, provedor fake, S3/disco local, cofre AES-GCM, BullMQ
  http/            Fastify: auth JWT, rotas REST e webhooks
  main.ts          processo da API (REST + webhooks)
  worker.ts        processo do worker (fila de envio, fila de entrada, manutenção)
web/               painel Next.js no modelo saas-template-web (BFF; ver web/README.md)
```

Trocar o provedor (ex.: Meta Cloud API) = implementar `OutboundMessagingAdapter` + `InboundAdapter` e registrá-los em `container.ts`. Nenhuma regra de campanha muda.

## 2. Limitações reais da Z-API (verificadas na documentação oficial)

| Tema | O que a doc diz | Como a POC trata |
|---|---|---|
| Autenticação de webhook | Não há assinatura/HMAC nos webhooks | URL com token aleatório por conta (só o hash fica no banco) + checagem de `instanceId` do payload. Rotação em `POST /admin/tenants/:tenantId/provider-accounts/:id/rotate-webhook` |
| HTTPS | "O Z-API não aceita webhooks que não sejam HTTPS" | Em dev, usar túnel (cloudflared/ngrok) |
| Mídia recebida | Fica no storage da Z-API por 30 dias | Copiamos para o nosso storage no processamento (não dependemos da URL) |
| Idempotência no envio | Não há chave de idempotência; `messageId` no corpo é "responder a" | Timeout ⇒ `unknown`, sem reenvio automático. Estado por parte evita reenviar o que já foi aceito |
| Status | `SENT`, `RECEIVED`, `READ`, `READ_BY_ME`, `PLAYED`; não há status de falha | `RECEIVED→delivered`, `PLAYED→read`, `READ_BY_ME` ignorado; falha só via `DeliveryCallback.error` |
| Grupos | `isGroup`, `phone` termina em `-group`, `participantPhone`/`participantLid` | Remetente = `participantPhone`. **Não há exemplo oficial de grupo populado** → validar na Fase 0 |
| `fromMe` | Pode notificar mensagens próprias se configurado | Ignoradas (evita loop com as respostas do sistema). Se o corretor usar o **mesmo número** da instância para postar, isso precisa ser revisto |
| `delayMessage` | Atraso de 1–15 s entre mensagens | Não usamos. Vazão controlada pela fila, com limites configuráveis |

## 3. Banco de dados

`prisma/schema.prisma` + `prisma/migrations/` (versionadas). Além das tabelas da spec:

- `recipient_messages`: uma linha por parte (imagem+texto, PDF). Garante que retry não reenvie parte já aceita.
- `suppression_list`: por telefone (não por contato), sobrevive a exclusão/reimportação.
- `secrets`: cofre local AES-256-GCM (tenant como AAD). Em produção: Secrets Manager/KMS pela mesma `SecretsPort`.
- `audit_logs`: consentimento, descadastro, confirmação, integrações, remetentes não autorizados.

Unicidades que garantem idempotência: `webhook_events(provider, external_event_id)`, `campaign_recipients(campaign_id, contact_id)`, `recipient_messages(recipient_id, part)`, `property_assets(tenant_id, source_message_id)`.

## 4. Estados

Campanha: `draft → awaiting_confirmation → processing ⇄ paused → completed`; `cancelled` a partir de qualquer estado não final; `failed` reservado para falha operacional. Toda transição é um `UPDATE ... WHERE status IN (origens válidas)`: só uma requisição concorrente vence.

Mensagem: `queued → processing → accepted → sent → delivered → read`, mais `failed`, `cancelled`, `unknown`. Webhooks nunca regridem o progresso. `unknown` pode avançar se o provedor confirmar depois.

## 5. Garantias de processamento

| Situação | Comportamento |
|---|---|
| Webhook repetido | `duplicate` (unique) — 200 para o provedor parar de reenviar |
| CONFIRMAR repetido/concorrente | CAS na campanha; destinatários com `skipDuplicates`; jobId = recipientId |
| Queda entre commit e enfileirar | Reconciliador (boot + a cada 60 s) re-enfileira `queued`/`processing` antigos |
| Worker morre durante chamada ao provedor | Parte fica `processing` → ao retomar vira `unknown`, sem reenvio |
| Worker morre antes da chamada | Destinatário `processing` sem parte em voo → retoma e envia uma vez |
| Timeout / 5xx ambíguo | `unknown` |
| 429 / 503 / conexão recusada | Retry com backoff exponencial; esgotou ⇒ `failed` (`retries_exhausted`); job fica retido (DLQ) |
| Número inválido | `failed` do destinatário; ≥10 falhas e >30% ⇒ campanha pausada |
| Instância desconectada / 401 / 403 | Campanha pausada com motivo |
| Opt-out durante a campanha | Recipientes `queued` cancelados na hora + revalidação imediatamente antes de cada envio |
| Status antes do messageId gravado | Evento reprocessado com backoff |

## 6. Riscos operacionais e de conformidade

1. **Z-API não é a API oficial da Meta.** Envio promocional por API não oficial pode levar a bloqueio do número; a POC não tenta contornar (sem rotação de números, sem atrasos aleatórios). Decisão pendente nº 2 da spec — a troca para Meta Cloud API exige templates de marketing aprovados e opt-in compatível com as políticas da Meta.
2. **Mesmo número para entrada e saída** (decisão pendente nº 3): as mensagens do corretor chegariam como `fromMe` e hoje são ignoradas. Recomendação: número de entrada separado do número de envio, ou ajuste explícito da regra.
3. **Consentimento (LGPD):** a importação não gera consentimento; exige origem + evidência por linha. Reativação de número descadastrado pelo corretor, só com nova evidência e confirmação explícita, auditada.
4. **Base64 vs URL de mídia:** `ASSET_DELIVERY=base64` funciona sem storage público, mas trafega o arquivo a cada destinatário. Em produção, `url` com S3 e URLs assinadas.
5. **Entrada serializada** (concurrency 1) para evitar dois rascunhos simultâneos do mesmo corretor. Escala: particionar por tenant.
6. **Ritmo por número**: uma fila por conta do provedor, 1 destinatário por vez, com intervalo + variação, pausa por lote, janela de horário e teto diário (ver README, "Envio em fila"). O worker abre um `Worker` BullMQ por número cadastrado (sincroniza a cada 30 s); com centenas de números, cada um mantém uma conexão Redis — em escala, fechar os workers de filas ociosas.
7. **IA**: não usada na POC. O conteúdo recebido é tratado como dado; nenhum texto altera destinatários ou permissões.
