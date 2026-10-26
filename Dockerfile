# API e worker do imobly — a MESMA imagem serve os dois.
#   APP_ROLE=api (padrão): aplica as migrations e sobe a API HTTP na porta $PORT (3000).
#   APP_ROLE=worker: sobe as filas (envio, entrada, manutenção). Sem porta, sem domínio.
# O painel (web/) tem o próprio Dockerfile.

FROM node:24-bookworm-slim AS build

# O Prisma precisa do OpenSSL para escolher o engine certo.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:24-bookworm-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# node_modules completo de propósito: a CLI do Prisma (migrate deploy) e o tsx (seed de teste)
# são devDependencies e precisam existir no container.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node package.json ./
# Fontes só para o seed de teste (npx tsx prisma/seed.ts importa de src/). Não são executadas.
COPY --chown=node:node tsconfig.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node docker/start.sh ./docker/start.sh

# Fotos e PDFs (STORAGE_DRIVER=local): monte um volume persistente aqui.
RUN mkdir -p /app/data/storage && chown -R node:node /app/data

USER node

EXPOSE 3000

# Só a API tem /health; no worker a verificação passa direto.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "if (process.env.APP_ROLE === 'worker') process.exit(0); fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["sh", "docker/start.sh"]
