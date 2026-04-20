#!/usr/bin/env bash
set -euo pipefail

# Vercel build script — builds monorepo packages in dependency order
# Uses turbo for caching; conditional prisma generate for speed
cd "$(dirname "$0")/.."

# Prisma generate: skip if schema unchanged (saves ~10s)
PRISMA_SCHEMA="packages/db/prisma/schema.prisma"
PRISMA_HASH_FILE="node_modules/.cache/.prisma-schema-hash"
CURRENT_HASH=$(shasum -a 256 "$PRISMA_SCHEMA" 2>/dev/null | cut -d' ' -f1)
CACHED_HASH=$(cat "$PRISMA_HASH_FILE" 2>/dev/null || echo "")

if [ "$CURRENT_HASH" != "$CACHED_HASH" ]; then
  pnpm -F @entitlement-os/db generate
  mkdir -p "$(dirname "$PRISMA_HASH_FILE")"
  echo "$CURRENT_HASH" > "$PRISMA_HASH_FILE"
else
  echo "Prisma schema unchanged — skipping generate"
fi

# Build packages via turbo (parallel + cached)
pnpm exec turbo run build \
  --filter=@entitlement-os/shared \
  --filter=@entitlement-os/db \
  --filter=@entitlement-os/artifacts \
  --filter=@entitlement-os/openai \
  --filter=@entitlement-os/evidence

cd apps/web
pnpm exec next build
