#!/bin/sh
# Applies pending SQL migrations during the Vercel production build only.
# Preview builds never touch the schema. Prisma Migrate needs a direct
# (non-pooled) connection, which the Neon integration provides separately.
set -eu
if [ "${VERCEL_ENV:-}" != "production" ]; then
  echo "vercel-migrate: skipped (VERCEL_ENV=${VERCEL_ENV:-unset})"
  exit 0
fi
url="${DATABASE_URL_UNPOOLED:-${POSTGRES_URL_NON_POOLING:-${DATABASE_URL:-}}}"
if [ -z "$url" ]; then
  echo "vercel-migrate: no database URL configured" >&2
  exit 1
fi
DATABASE_URL="$url" pnpm db:migrate
# Hand the admin login over to ADMIN_EMAIL/ADMIN_PASSWORD once, if they are set.
DATABASE_URL="$url" pnpm --filter @forma/api exec tsx prisma/sync-admin.ts
