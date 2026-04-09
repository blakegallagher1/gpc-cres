#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; FAILURES=$((FAILURES + 1)); }
warn() { echo -e "${YELLOW}!${NC} $1"; }

FAILURES=0
TS_IP="${WINDOWS_HOST_TAILSCALE_IP:-100.67.140.126}"

echo "=== Linux Control Plane Preflight ==="
echo "Windows Tailscale IP: $TS_IP"
echo ""

if ping -c 1 -W 3 "$TS_IP" >/dev/null 2>&1; then
  pass "Tailscale reachability to Windows host"
else
  fail "Cannot reach Windows host over Tailscale"
fi

if curl -fsS --max-time 5 "http://$TS_IP:8000/health" >/dev/null; then
  pass "Windows gateway reachable over Tailscale"
else
  fail "Windows gateway unreachable over Tailscale"
fi

if curl -fsS --max-time 5 "http://$TS_IP:3001/health" >/dev/null; then
  pass "Windows CUA worker reachable over Tailscale"
else
  warn "Windows CUA worker unreachable over Tailscale"
fi

if nc -z -w3 "$TS_IP" 54323 >/dev/null 2>&1; then
  pass "Windows app DB port reachable"
else
  fail "Windows app DB port 54323 unreachable"
fi

if curl -fsS --max-time 5 "http://localhost:8000/health" >/dev/null; then
  pass "Linux gateway local health"
else
  warn "Linux gateway not yet healthy on localhost:8000"
fi

if curl -fsS --max-time 5 "http://localhost:3001/health" >/dev/null; then
  pass "Linux CUA local health"
else
  warn "Linux CUA not yet healthy on localhost:3001"
fi

echo ""
if [ "$FAILURES" -eq 0 ]; then
  echo -e "${GREEN}Preflight passed.${NC}"
else
  echo -e "${RED}$FAILURES check(s) failed.${NC}"
  exit 1
fi
