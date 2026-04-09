#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; FAILURES=$((FAILURES + 1)); }
warn() { echo -e "${YELLOW}!${NC} $1"; }

FAILURES=0
PUBLIC_API_URL="${PUBLIC_API_URL:-https://api.gallagherpropco.com}"
PUBLIC_CUA_URL="${PUBLIC_CUA_URL:-https://cua.gallagherpropco.com}"

echo "=== Control Plane Cutover Verification ==="

if curl -fsS --max-time 10 "$PUBLIC_API_URL/health" >/dev/null; then
  pass "Public gateway health"
else
  fail "Public gateway health failed"
fi

if curl -fsS --max-time 10 "$PUBLIC_CUA_URL/cua/health" >/dev/null; then
  pass "Public CUA health"
else
  warn "Public CUA health failed"
fi

if curl -fsS --max-time 10 "http://localhost:8000/health" >/dev/null; then
  pass "Linux gateway localhost health"
else
  fail "Linux gateway localhost health failed"
fi

if curl -fsS --max-time 10 "http://localhost:3001/health" >/dev/null; then
  pass "Linux CUA localhost health"
else
  fail "Linux CUA localhost health failed"
fi

echo ""
if [ "$FAILURES" -eq 0 ]; then
  echo -e "${GREEN}Cutover verification passed.${NC}"
else
  echo -e "${RED}$FAILURES verification check(s) failed.${NC}"
  exit 1
fi
