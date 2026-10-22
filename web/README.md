# ImobZap Web

Painel web do ImobZap, construído sobre o modelo `saas-template-web` da Jhota: mesmo shell (sidebar, header, tema claro/escuro), mesmos componentes e mesmo padrão BFF.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS · sessão JWT em cookie HTTP-only.

## Arquitetura (igual ao template)

- `src/app/(app)`: área autenticada com sidebar.
- `src/app/api`: Route Handlers (BFF). O navegador chama **apenas** `/api/*`; o token da API do ImobZap fica dentro do cookie de sessão assinado e nunca chega ao JavaScript do browser.
- `src/lib/server`: `saasFetch` (headers de autenticação), `fetchSaasList`/`fetchSaasResource` (Server Components) e `proxySaasRequest` (rotas BFF).
- `src/services`: chamadas do navegador ao BFF.
- `src/middleware.ts`: exige sessão nas páginas e restringe `/configuracoes` a administradores. A API aplica as mesmas regras no servidor.

Listagens seguem o padrão do template: `page.tsx` (Server Component) carrega os dados e entrega a uma tabela `*-table-client.tsx`.

| Tela | Rota |
|---|---|
| Painel | `/painel` |
| Campanhas (lista, detalhe com métricas ao vivo, confirmar/pausar/retomar/cancelar, destinatários) | `/campanhas`, `/campanhas/[id]` |
| Imóveis (lista, cadastro, correção, fotos/PDF, nova campanha) | `/imoveis`, `/imoveis/novo`, `/imoveis/[id]/editar` |
| Contatos (carteira, consentimento, descadastro, novo, CSV, supressão) | `/contatos`, `/contatos/novo`, `/contatos/importar`, `/contatos/descadastros` |
| Configurações — só administradores (integração Z-API + diagnóstico de webhooks, usuários, auditoria) | `/configuracoes/*` |

## Configuração

```bash
cp .env.example .env.local     # SAAS_API_BASE_URL e JWT_SECRET
npm install
npm run dev                    # http://localhost:3003
```

A API do ImobZap (raiz do repositório) precisa estar rodando em `SAAS_API_BASE_URL`.

## Identidade visual

Segue o manual da marca **imobly**: amarelo `#FFD600`, preto `#0B0B0B`, cinza escuro `#1F1F1F`, cinza claro `#E5E7EB` e Montserrat em tudo (rótulos em caixa alta pela classe `.rotulo`). O tema escuro é o padrão.

- Símbolo (casa + balão com reticências): [`BrandMark`](src/components/brand-mark.tsx); logotipo "imo**bly**" + "by Jhota Software": [`Logo`](src/components/logo.tsx). Ícone do app/favicon: [`src/app/icon.svg`](src/app/icon.svg) (cópias em `public/images/logo/imobly-*.svg`).
- Peça principal (login e manual): fundo `.imobly-hero-bg`, chamada "Seu próximo imóvel. Na conversa certa.", faixa Campanhas · Imóveis · Clientes e o celular com a conversa ([`components/marketing`](src/components/marketing)).

A cor de destaque `primary` muda por tema (variáveis em `src/css/style.css`): amarelo no escuro e preto no claro, porque amarelo como texto sobre branco não é legível. Botões usam `bg-primary text-primary-foreground`, nunca `text-white`. Para o amarelo fixo nos dois modos existe o token `neon` (nome antigo mantido; o valor agora é `#FFD600`) e `ink` para o preto.

O **manual de uso pelo WhatsApp** fica em `/manual` ([`src/app/manual/page.tsx`](src/app/manual/page.tsx)), público, linkado no login e na barra lateral. Os números da seção "Envio em fila" são os padrões `SEND_*` da API: se o administrador mudar, atualize a página.

## Diferenças em relação ao template

- Marca fixa (ImobZap), sem white-label por domínio e sem catálogo público de planos.
- Paleta azul e fonte Satoshi do template substituídas pela identidade do site Jhota.
- Sem módulos financeiros, gráficos (ApexCharts) e mapas.
- Perfis da API (`owner`/`admin`/`agent`) mapeados para os do template (`admin`/`operador`).
- O `proxySaasRequest` responde 401 sem sessão e normaliza os erros da API para `{ error: mensagem }`.
- Componentes novos: `StatusBadge`, `FormDialog`, `ListCard`/`PageIntro` e versões controladas de `Select`/`TextArea`.
- npm em vez de yarn.

## Docker

O `Dockerfile` (herdado do template) gera a imagem standalone, roda como usuário não-root e declara healthcheck em `/api/health`.
