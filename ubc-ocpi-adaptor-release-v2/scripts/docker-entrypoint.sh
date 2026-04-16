#!/bin/sh
set -e
cd /app

if [ "${SKIP_PRISMA_MIGRATE:-false}" = "true" ]; then
  echo "SKIP_PRISMA_MIGRATE=true — skipping prisma migrate deploy"
else
  echo "Applying Prisma migrations (migrate deploy)..."
  npx prisma migrate deploy
fi

exec node dist/index.js
