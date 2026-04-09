#!/usr/bin/env bash
set -euo pipefail

# Vercel build script — builds monorepo packages in dependency order
cd "$(dirname "$0")/.."

pnpm -F @entitlement-os/db generate
pnpm -F @entitlement-os/shared build
pnpm -F @entitlement-os/db build
pnpm -F @entitlement-os/artifacts build
pnpm -F @entitlement-os/openai build
pnpm -F @entitlement-os/evidence build

cd apps/web
pnpm exec next build
