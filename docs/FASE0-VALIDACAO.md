# Fase 0 — Roteiro de validação com a Z-API real

Objetivo: confirmar as premissas antes do MVP (seção 15 da spec). Use **números de teste seus** e contatos que concordaram em participar.

## Preparação

1. Instância Z-API conectada (QR code) e, se possível, um **segundo número** para fazer o papel de corretor.
2. Variáveis no `.env`: `ZAPI_INSTANCE_ID`, `ZAPI_INSTANCE_TOKEN`, `ZAPI_CLIENT_TOKEN` (se o token de segurança estiver ativado).
3. Receptor de webhooks + túnel HTTPS:
   ```bash
   npm run probe:zapi -- capture --port 4020
   cloudflared tunnel --url http://localhost:4020     # ou: ngrok http 4020
   ```
4. No painel Z-API, aponte os webhooks **Ao receber** e **Status da mensagem** para a URL do túnel. Ative "notificar enviadas por mim" só se for testar o cenário de número único.

## Testes

| # | Ação | O que observar (o `report` resume) |
|---|---|---|
| 1 | Crie um grupo privado com a instância e o número do corretor. O corretor envia um texto | `isGroup: true`, `phone` termina em `-group`, **`participantPhone` preenchido** (ou só `participantLid`?) |
| 2 | Corretor envia 3 fotos de uma vez | Um evento por foto? Legenda só na primeira? Ordem de chegada? |
| 3 | Corretor envia um PDF | `document.documentUrl`, `mimeType`, `fileName`; baixe a URL e confira o arquivo |
| 4 | Mesmos testes em conversa direta | Diferenças de payload em relação ao grupo |
| 5 | `npm run probe:zapi -- send-text --phone <seu número> --text "teste"` | Resposta com `messageId`; webhooks `SENT`, `RECEIVED`, `READ` chegam? |
| 6 | `send-pdf --url <PDF público>` e `send-image --url <JPG público>` | Entrega correta no celular; nome do arquivo exibido |
| 7 | Envie para um número sem WhatsApp | Qual erro volta (HTTP? `DeliveryCallback.error`?) |
| 8 | Desconecte o celular da instância e envie | Código/mensagem de erro (para mapear `account_restricted`) |
| 9 | Do número de teste, responda **SAIR** | Chega como `ReceivedCallback` direto, com `phone` do contato |
| 10 | Mensagens fromMe | Se o corretor usar o número da instância, as mensagens chegam como `fromMe: true` |

Depois rode `npm run probe:zapi -- report`. Ele responde ao checklist e lista as URLs de mídia para testar download e validade.

## Decisões que dependem do resultado

- **Grupo confiável?** Se `participantPhone` não vier (só LID), usar `inboundMode: direct` (o corretor manda no privado do número da instância) ou o formulário do painel. Nada mais muda no sistema.
- **`ids` do status = `messageId` do envio?** O sistema assume que sim. Se for `zaapId`, ajustar uma linha em `zapi-outbound.ts`.
- **Número único ou separado?** (ver riscos em ARQUITETURA.md)
- **Z-API ou Meta Cloud API para o envio promocional?** Ver o risco nº 1.

## Ligando a POC à Z-API real

1. `PUBLIC_BASE_URL` = URL HTTPS do túnel apontando para a API (porta 3000).
2. Painel → Integrações → Conectar Z-API (instance id/token, id do grupo). Copie a URL de webhook exibida e configure-a nos dois webhooks da instância.
3. Cadastre o telefone do corretor no usuário (o seed usa +55 11 98888-7777; ajuste no banco ou crie um usuário via `POST /users`).
4. Para mídia por URL (em vez de base64), use `STORAGE_DRIVER=s3` com bucket privado e `ASSET_DELIVERY=url`.
