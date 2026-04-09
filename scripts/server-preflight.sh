#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; FAILURES=$((FAILURES + 1)); }
warn() { echo -e "${YELLOW}!${NC} $1"; }

FAILURES=0
TS_IP="${GPC_TAILSCALE_IP:-100.67.140.126}"

echo "=== GPC Server Preflight ==="
echo "Tailscale IP: $TS_IP"
echo ""

# 1. Tailscale mesh (use ping since tailscale CLI may not be in PATH on macOS app)
echo "--- Tailscale ---"
if ping -c 1 -W 3 "$TS_IP" &>/dev/null 2>&1; then
    pass "Tailscale: Windows PC reachable ($TS_IP)"
else
    fail "Tailscale: Windows PC unreachable"
fi

# 2. SSH over Tailscale
echo "--- SSH ---"
if ssh -o ConnectTimeout=3 -o BatchMode=yes "cres_admin@$TS_IP" "echo ok" &>/dev/null 2>&1; then
    pass "SSH: Direct connection working"
else
    warn "SSH: Tailscale path failed, trying Cloudflare..."
    if ssh -o ConnectTimeout=10 -o BatchMode=yes bg-cf "echo ok" &>/dev/null 2>&1; then
        pass "SSH: Cloudflare fallback working"
    else
        fail "SSH: Both paths failed"
    fi
fi

# 3. Gateway health
echo "--- Services ---"
if curl -sf --max-time 5 "http://$TS_IP:8000/health" &>/dev/null; then
    pass "Gateway: Healthy (Tailscale direct)"
elif curl -sf --max-time 5 "https://api.gallagherpropco.com/health" &>/dev/null; then
    pass "Gateway: Healthy (Cloudflare fallback)"
else
    fail "Gateway: Unreachable on both paths"
fi

# 4. Tile server
if curl -sf --max-time 5 "http://$TS_IP:3000/health" &>/dev/null; then
    pass "Martin Tiles: Healthy"
else
    fail "Martin Tiles: Unreachable"
fi

# 5. Database
if nc -z -w3 "$TS_IP" 54323 &>/dev/null 2>&1; then
    pass "PostgreSQL: Port 54323 open"
else
    fail "PostgreSQL: Port 54323 unreachable"
fi

# 6. CUA Worker
if curl -sf --max-time 5 "http://$TS_IP:3001/health" &>/dev/null; then
    pass "CUA Worker: Healthy"
else
    warn "CUA Worker: Not responding (may be expected)"
fi

# 6b. Container health state (Docker-native, catches false-green endpoint cases)
echo "--- Container Health ---"
container_health_output=$(ssh -o ConnectTimeout=3 -o BatchMode=yes "cres_admin@$TS_IP" \
  "powershell -NoProfile -Command \"docker inspect --format='{{.Name}} {{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' fastapi-gateway gpc-cua-worker martin-tile-server entitlement-os-postgres qdrant\"" \
  2>/dev/null | tr -d '\r' || true)

if [ -n "$container_health_output" ]; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    name=$(echo "$line" | awk '{print $1}')
    state=$(echo "$line" | awk '{print $2}')
    case "$state" in
      healthy|no-healthcheck)
        pass "Container health: $name -> $state"
        ;;
      unhealthy)
        fail "Container health: $name -> unhealthy"
        ;;
      *)
        warn "Container health: $name -> $state"
        ;;
    esac
  done <<< "$container_health_output"
else
  warn "Container health: Could not inspect Docker health state"
fi

# 7. Qdrant
if curl -sf --max-time 5 "http://$TS_IP:6333" &>/dev/null; then
    pass "Qdrant: Healthy"
else
    fail "Qdrant: Unreachable"
fi

# 8. Cloudflare tunnel (external path)
echo "--- Cloudflare (public path) ---"
if curl -sf --max-time 8 "https://api.gallagherpropco.com/health" &>/dev/null; then
    pass "Cloudflare Tunnel: Public gateway reachable"
else
    warn "Cloudflare Tunnel: Public gateway unreachable (Tailscale path still works)"
fi

# 9. Watchdog heartbeat
echo "--- Watchdog ---"
HEARTBEAT=$(ssh -o ConnectTimeout=3 -o BatchMode=yes "cres_admin@$TS_IP" \
    "type C:\gpc-cres-backend\logs\heartbeat.txt" 2>/dev/null | tr -d '\r' | tail -1 || echo "")
if [ -n "$HEARTBEAT" ]; then
    pass "Watchdog: Last heartbeat $HEARTBEAT"
else
    warn "Watchdog: Could not read heartbeat"
fi

echo ""
if [ $FAILURES -eq 0 ]; then
    echo -e "${GREEN}All systems operational.${NC}"
else
    echo -e "${RED}$FAILURES check(s) failed. See above.${NC}"
    exit 1
fi
