#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_ENV_FILE="$ROOT_DIR/scripts/observability/.env.monitor-prod"
ENV_FILE="${OBS_MONITOR_ENV_FILE:-${MONITOR_ENV_FILE:-$DEFAULT_ENV_FILE}}"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

export BASE_URL="${BASE_URL:-${OBS_BASE_URL:-${MAP_SMOKE_BASE_URL:-https://gallagherpropco.com}}}"
export MAP_SMOKE_BASE_URL="${MAP_SMOKE_BASE_URL:-$BASE_URL}"
export AUTH_BEARER="${AUTH_BEARER:-${OBS_AUTH_BEARER:-${MAP_SMOKE_AUTH_BEARER:-}}}"
export MAP_SMOKE_AUTH_BEARER="${MAP_SMOKE_AUTH_BEARER:-$AUTH_BEARER}"
export HEALTH_TOKEN="${HEALTH_TOKEN:-${OBS_HEALTH_TOKEN:-${HEALTHCHECK_TOKEN:-}}}"
export HEALTHCHECK_TOKEN="${HEALTHCHECK_TOKEN:-$HEALTH_TOKEN}"

echo "[verify-production-features] Deprecated compatibility wrapper"
echo "[verify-production-features] This script now delegates to the authenticated production smoke suite."
echo "[verify-production-features] env_file=$ENV_FILE"
echo "[verify-production-features] base_url=$BASE_URL"
echo "[verify-production-features] auth_bearer=$([ -n "$AUTH_BEARER" ] && echo set || echo missing)"
echo "[verify-production-features] health_token=$([ -n "$HEALTH_TOKEN" ] && echo set || echo missing)"

cd "$ROOT_DIR"

pnpm smoke:gateway:edge-access
pnpm smoke:endpoints
pnpm parcel:smoke:prod

echo "[verify-production-features] Current production smoke suite passed."
