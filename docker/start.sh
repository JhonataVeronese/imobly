#!/bin/sh
# Entrada do container da API/worker. APP_ROLE escolhe o processo (ver Dockerfile).
set -e

# Migrations versionadas: idempotente, só aplica o que falta. API e worker sobem juntos no
# primeiro deploy; os dois rodam isto e o advisory lock do Prisma no Postgres faz um esperar o
# outro — o worker nunca começa antes das tabelas existirem.
case "${APP_ROLE:-api}" in
  worker)
    npx prisma migrate deploy
    exec node dist/worker.js
    ;;
  api)
    npx prisma migrate deploy
    exec node dist/main.js
    ;;
  *)
    echo "APP_ROLE inválido: '${APP_ROLE}' (use api ou worker)" >&2
    exit 1
    ;;
esac
