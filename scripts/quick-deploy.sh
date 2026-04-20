#!/usr/bin/env bash
set -euo pipefail

# Quick deploy: build locally (warm cache), deploy to Vercel production
# Usage:
#   ./scripts/quick-deploy.sh              # full deploy with typecheck
#   ./scripts/quick-deploy.sh --fast       # skip typecheck + sentry source maps
#   ./scripts/quick-deploy.sh --dry        # local build only, no deploy
#   ./scripts/quick-deploy.sh --prebuilt   # use vercel build + deploy --prebuilt (fastest)
#
# First-time setup:
#   cd apps/web && pnpm exec vercel pull --yes --environment production && cd ../..

cd "$(dirname "$0")/.."
ROOT=$(pwd)
START=$SECONDS

FAST=false
DRY=false
PREBUILT=false
for arg in "$@"; do
  case $arg in
    --fast)     FAST=true ;;
    --dry)      DRY=true ;;
    --prebuilt) PREBUILT=true ;;
  esac
done

# ── Safety checks ──────────────────────────────────────────────────
if [ -n "$(git status --porcelain)" ]; then
  echo "⚠  Working directory not clean."
  git status --short
  echo ""
  read -p "Deploy anyway? (y/N) " -n 1 -r
  echo
  [[ $REPLY =~ ^[Yy]$ ]] || exit 1
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
  echo "⚠  On branch '$BRANCH', not main."
  read -p "Deploy anyway? (y/N) " -n 1 -r
  echo
  [[ $REPLY =~ ^[Yy]$ ]] || exit 1
fi

# ── Typecheck (skip with --fast) ──────────────────────────────────
if [ "$FAST" = false ]; then
  echo "→ Typechecking..."
  TYPECHECK_START=$SECONDS
  pnpm exec turbo run build \
    --filter=@entitlement-os/shared \
    --filter=@entitlement-os/db \
    --filter=@entitlement-os/artifacts \
    --filter=@entitlement-os/openai \
    --filter=@entitlement-os/evidence 2>&1 | tail -3
  pnpm --filter gpc-agent-dashboard exec tsc --noEmit 2>&1 | tail -5 || true
  echo "  Typecheck: $(( SECONDS - TYPECHECK_START ))s"
fi

# ── Build ──────────────────────────────────────────────────────────
echo "→ Building..."
BUILD_START=$SECONDS

if [ "$FAST" = true ]; then
  SENTRY_AUTH_TOKEN="" bash scripts/vercel-build.sh
else
  SENTRY_AUTH_TOKEN="${SENTRY_AUTH_TOKEN:-}" bash scripts/vercel-build.sh
fi

echo "  Build: $(( SECONDS - BUILD_START ))s"

# ── Deploy ─────────────────────────────────────────────────────────
if [ "$DRY" = true ]; then
  echo ""
  echo "✓ Dry run complete in $(( SECONDS - START ))s — skipping deploy"
  exit 0
fi

echo "→ Deploying to production..."
DEPLOY_START=$SECONDS

if [ "$PREBUILT" = true ]; then
  # Prebuilt path: generate .vercel/output then deploy without remote build
  cd apps/web
  rm -rf .vercel/output
  pnpm exec vercel build --prod --yes 2>&1 | tail -3
  pnpm exec vercel deploy --prebuilt --prod --archive=tgz --yes 2>&1 | tail -3
  cd "$ROOT"
else
  # Direct path: upload source, remote build (uses Vercel's cache)
  # Still faster than git-push because we already validated locally
  pnpm exec vercel deploy --prod --archive=tgz --yes 2>&1 | tail -5
fi

echo "  Deploy: $(( SECONDS - DEPLOY_START ))s"

TOTAL=$(( SECONDS - START ))
echo ""
echo "✓ Deployed to production in ${TOTAL}s"
echo "  $(git log --oneline -1)"
