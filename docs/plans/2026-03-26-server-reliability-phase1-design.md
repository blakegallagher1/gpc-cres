# Phase 1: Server Reliability — Tailscale Mesh + Self-Healing Watchdog

**Date:** 2026-03-26
**Status:** Design approved
**Goal:** Eliminate daily Windows PC connectivity failures by adding a reliable private mesh network and automated self-healing.

## Problem Statement

The Windows 11 server (BG) runs all backend services behind Cloudflare Tunnel. Three recurring failures cause daily friction:

1. **SSH drops mid-session** — Cloudflare's websocket-based SSH proxy has known reliability issues (8-hour session limits, frequent disconnects during maintenance).
2. **Services die silently** — sshd, cloudflared, or Docker containers crash with no notification. Nobody knows until the next attempt to use them.
3. **Codex/Claude can't reach the server** — Agents attempt Admin API or SSH calls and get timeouts or 502s because the tunnel or a service is down.

## Architecture: Dual-Path Networking

```
┌─────────────────────────────────────────────────────────────────┐
│                        PUBLIC TRAFFIC                            │
│  gallagherpropco.com → Vercel                                   │
│  api/tiles/cua.gallagherpropco.com → Cloudflare Tunnel → Docker │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    OPERATOR / AGENT TRAFFIC                      │
│  Mac (100.x.x.1) ←─── WireGuard P2P ───→ Windows PC (100.x.x.2)│
│  Codex VM (100.x.x.3) ←── WireGuard ──→ Windows PC (100.x.x.2) │
│                                                                   │
│  Direct access: SSH, Docker, Postgres, Admin API, Uptime Kuma    │
│  No Cloudflare in the path. No websocket proxying.               │
└─────────────────────────────────────────────────────────────────┘
```

**Principle:** Cloudflare stays for public HTTP traffic (it's excellent at CDN, DDoS, edge caching). Tailscale handles all private operator/agent access where reliability matters most.

## Component 1: Tailscale Mesh Network

### 1A. Install Tailscale on Windows PC

- Download and install Tailscale for Windows from https://tailscale.com/download/windows
- Authenticate with Tailscale account (Google SSO or email)
- The PC gets a stable Tailscale IP (e.g., `100.64.x.x`) that never changes
- Enable Tailscale to start on boot (Windows Service, automatic startup)

### 1B. Install Tailscale on Mac

- `brew install tailscale` or download from https://tailscale.com/download/mac
- Authenticate with same Tailscale account
- Mac gets its own Tailscale IP
- After install, `ping 100.x.x.x` (Windows PC's Tailscale IP) should work instantly

### 1C. Install Tailscale on Codex VM (Hetzner)

- `curl -fsSL https://tailscale.com/install.sh | sh`
- `sudo tailscale up --authkey=<pre-auth-key>` (use a pre-auth key from Tailscale admin console)
- This gives Codex a direct WireGuard path to the Windows PC

### 1D. Tailscale Sidecar in Docker Compose

Add a Tailscale sidecar container to expose Docker services on the Tailscale network:

```yaml
  tailscale:
    image: tailscale/tailscale:latest
    container_name: gpc-tailscale
    hostname: gpc-backend
    restart: unless-stopped
    environment:
      - TS_AUTHKEY=${TAILSCALE_AUTHKEY}
      - TS_STATE_DIR=/var/lib/tailscale
      - TS_SERVE_CONFIG=/config/ts-serve.json
      - TS_EXTRA_ARGS=--advertise-tags=tag:server
    volumes:
      - tailscale-state:/var/lib/tailscale
      - ./tailscale-config:/config
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    devices:
      - /dev/net/tun:/dev/net/tun
    networks:
      - internal

volumes:
  tailscale-state:
```

The `ts-serve.json` config exposes internal services on the Tailscale network:

```json
{
  "TCP": {
    "443": { "HTTPS": true },
    "8000": { "HTTP": true },
    "3000": { "HTTP": true },
    "5432": { "TCPForward": "entitlement-os-postgres:5432" }
  },
  "Web": {
    "gpc-backend.tail-xxxxx.ts.net:443": {
      "Handlers": {
        "/": { "Proxy": "http://gateway:8000" }
      }
    }
  }
}
```

### 1E. Update Connection Config

After Tailscale is running, update connection preferences:

| Operation | Before (Cloudflare) | After (Tailscale primary) |
|-----------|-------------------|--------------------------|
| SSH | `ssh cres_admin@ssh.gallagherpropco.com` (flaky websocket) | `ssh cres_admin@100.x.x.x` (direct WireGuard) |
| Admin API | `https://api.gallagherpropco.com/admin` (CF tunnel) | `http://100.x.x.x:8000/admin` (direct) |
| Database | `cloudflared access tcp --hostname db.gallagherpropco.com` | `psql -h 100.x.x.x -p 5432` (direct) |
| Tile debug | `https://tiles.gallagherpropco.com` (CF tunnel) | `http://100.x.x.x:3000` (direct) |
| CUA worker | `https://cua.gallagherpropco.com` (CF tunnel + proxy) | `http://100.x.x.x:3001` (direct) |

### 1F. Update SSH Config

```
# ~/.ssh/config — add Tailscale as primary, Cloudflare as fallback
Host bg-ts
    HostName 100.x.x.x
    User cres_admin
    ConnectTimeout 5

Host bg-cf
    HostName ssh.gallagherpropco.com
    User cres_admin
    ProxyCommand cloudflared access ssh --hostname ssh.gallagherpropco.com
    ConnectTimeout 10

# Smart alias: try Tailscale first, fall back to Cloudflare
Host bg
    HostName 100.x.x.x
    User cres_admin
    ConnectTimeout 3
```

### 1G. Update server-ops Skill and AGENTS.md

Add Tailscale connection details to `skills/server-ops/SKILL.md` and `AGENTS.md` so Claude and Codex know the preferred connection path.

## Component 2: Windows Watchdog Service

A PowerShell script running as a Windows Scheduled Task every 60 seconds. Checks critical services and auto-restarts them.

### 2A. Watchdog Script

File: `C:\gpc-cres-backend\scripts\watchdog.ps1`

```powershell
$logFile = "C:\gpc-cres-backend\logs\watchdog.log"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

function Log($msg) {
    "$timestamp | $msg" | Out-File -Append $logFile
}

# 1. Check sshd
$sshd = Get-Service -Name sshd -ErrorAction SilentlyContinue
if ($sshd -and $sshd.Status -ne 'Running') {
    Log "RESTART: sshd was $($sshd.Status)"
    Start-Service sshd
}

# 2. Check Tailscale
$tailscale = Get-Service -Name Tailscale -ErrorAction SilentlyContinue
if ($tailscale -and $tailscale.Status -ne 'Running') {
    Log "RESTART: Tailscale was $($tailscale.Status)"
    Start-Service Tailscale
}

# 3. Check Docker Desktop
$docker = Get-Process "Docker Desktop" -ErrorAction SilentlyContinue
if (-not $docker) {
    Log "RESTART: Docker Desktop not running"
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    Start-Sleep -Seconds 30
}

# 4. Check critical containers
$containers = @("gateway", "martin", "entitlement-os-postgres", "cloudflared", "gpc-cua-worker", "qdrant")
foreach ($c in $containers) {
    $status = docker inspect --format='{{.State.Status}}' $c 2>$null
    if ($status -ne "running") {
        Log "RESTART: container $c was '$status'"
        docker start $c
    }
}

# 5. Health check gateway (functional test, not just running)
try {
    $resp = Invoke-WebRequest -Uri "http://localhost:8000/health" -TimeoutSec 5 -UseBasicParsing
    if ($resp.StatusCode -ne 200) {
        Log "RESTART: gateway health check failed (status $($resp.StatusCode))"
        docker restart gateway
    }
} catch {
    Log "RESTART: gateway health check unreachable"
    docker restart gateway
}

# 6. Heartbeat — write timestamp for external monitoring
$timestamp | Out-File "C:\gpc-cres-backend\logs\heartbeat.txt" -Force
```

### 2B. Register as Scheduled Task

```powershell
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -File C:\gpc-cres-backend\scripts\watchdog.ps1"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Seconds 60) `
    -RepetitionDuration ([TimeSpan]::MaxValue)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteryPower `
    -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest

Register-ScheduledTask -TaskName "GPC-Watchdog" `
    -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description "GPC Backend Service Watchdog - checks every 60s"
```

### 2C. Log Rotation

The watchdog writes to `C:\gpc-cres-backend\logs\watchdog.log`. Add a daily rotation task that archives logs older than 7 days.

## Component 3: Uptime Kuma Monitoring

### 3A. Add to Docker Compose

```yaml
  uptime-kuma:
    image: louislam/uptime-kuma:1
    container_name: gpc-uptime-kuma
    restart: unless-stopped
    volumes:
      - uptime-kuma-data:/app/data
    ports:
      - "127.0.0.1:3001:3001"  # Only on localhost, accessed via Tailscale
    networks:
      - internal

volumes:
  uptime-kuma-data:
```

**Note:** Port conflict with CUA worker (both use 3001). CUA worker should be moved to 3002 or Uptime Kuma to 3003. Design decision: move Uptime Kuma to **3003**.

### 3B. Monitors to Configure

After first launch (via Tailscale: `http://100.x.x.x:3003`), set up these monitors:

| Monitor | Type | URL/Target | Interval | Alert |
|---------|------|-----------|----------|-------|
| Gateway Health | HTTP | `http://gateway:8000/health` | 30s | Push notification |
| Martin Tiles | HTTP | `http://martin:3000/health` | 60s | Push notification |
| PostgreSQL | TCP Port | `entitlement-os-postgres:5432` | 30s | Push notification |
| Qdrant | HTTP | `http://qdrant:6333/dashboard` | 60s | Push notification |
| CUA Worker | HTTP | `http://gpc-cua-worker:3001/health` | 60s | Push notification |
| Cloudflared Tunnel | HTTP | `https://api.gallagherpropco.com/health` | 60s | Push notification |
| Tailscale | TCP Port | `localhost:41641` | 60s | Push notification |
| Vercel Frontend | HTTP | `https://gallagherpropco.com` | 120s | Push notification |
| Watchdog Heartbeat | Push | (watchdog POSTs every 60s) | 90s dead | Push notification |

### 3C. Notification Channels

- **Pushover** or **Ntfy.sh** — Push notifications to phone
- **Slack webhook** (optional) — #gpc-alerts channel
- **Email** — Fallback

### 3D. Status Page

Uptime Kuma has a built-in public status page. Optionally expose at `status.gallagherpropco.com` via Tailscale Funnel or keep it private on Tailscale only.

## Component 4: Mac-Side Preflight Script

A quick script to run before any server work session. Checks all paths and reports status.

File: `scripts/server-preflight.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; FAILURES=$((FAILURES + 1)); }
warn() { echo -e "${YELLOW}!${NC} $1"; }

FAILURES=0
TS_IP="${GPC_TAILSCALE_IP:-100.x.x.x}"  # Set in ~/.zshrc

echo "=== GPC Server Preflight ==="
echo ""

# 1. Tailscale mesh
echo "--- Tailscale ---"
if tailscale ping "$TS_IP" --timeout 3s &>/dev/null; then
    pass "Tailscale: Windows PC reachable ($TS_IP)"
else
    fail "Tailscale: Windows PC unreachable"
fi

# 2. SSH over Tailscale
echo "--- SSH ---"
if ssh -o ConnectTimeout=3 -o BatchMode=yes "cres_admin@$TS_IP" "echo ok" &>/dev/null; then
    pass "SSH: Direct connection working"
else
    warn "SSH: Tailscale path failed, trying Cloudflare..."
    if ssh -o ConnectTimeout=10 -o BatchMode=yes bg-cf "echo ok" &>/dev/null; then
        pass "SSH: Cloudflare fallback working"
    else
        fail "SSH: Both paths failed"
    fi
fi

# 3. Gateway health
echo "--- Services ---"
if curl -sf --max-time 5 "http://$TS_IP:8000/health" &>/dev/null; then
    pass "Gateway: Healthy (Tailscale)"
elif curl -sf --max-time 5 "https://api.gallagherpropco.com/health" &>/dev/null; then
    pass "Gateway: Healthy (Cloudflare)"
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
if pg_isready -h "$TS_IP" -p 5432 -t 3 &>/dev/null; then
    pass "PostgreSQL: Accepting connections"
else
    fail "PostgreSQL: Not responding"
fi

# 6. CUA Worker
if curl -sf --max-time 5 "http://$TS_IP:3001/health" &>/dev/null; then
    pass "CUA Worker: Healthy"
else
    warn "CUA Worker: Not responding (may be expected if not running)"
fi

# 7. Uptime Kuma
if curl -sf --max-time 5 "http://$TS_IP:3003" &>/dev/null; then
    pass "Uptime Kuma: Running"
else
    warn "Uptime Kuma: Not responding"
fi

# 8. Watchdog heartbeat
echo "--- Watchdog ---"
HEARTBEAT=$(ssh -o ConnectTimeout=3 -o BatchMode=yes "cres_admin@$TS_IP" \
    "cat C:\\gpc-cres-backend\\logs\\heartbeat.txt 2>/dev/null" 2>/dev/null || echo "")
if [ -n "$HEARTBEAT" ]; then
    pass "Watchdog: Last heartbeat $HEARTBEAT"
else
    warn "Watchdog: Could not read heartbeat"
fi

echo ""
if [ $FAILURES -eq 0 ]; then
    echo -e "${GREEN}All systems operational.${NC}"
else
    echo -e "${RED}$FAILURES check(s) failed.${NC}"
fi
```

## Rollout Order

1. **Install Tailscale on Windows PC** (5 min) — immediate SSH reliability improvement
2. **Install Tailscale on Mac** (2 min) — verify peer-to-peer connection
3. **Register watchdog Scheduled Task on Windows** (10 min) — services auto-heal
4. **Add Uptime Kuma to Docker Compose** (5 min) — monitoring dashboard
5. **Configure Uptime Kuma monitors** (15 min) — all services + phone notifications
6. **Add preflight script to repo** (5 min) — session startup check
7. **Install Tailscale on Codex VM** (5 min) — Codex gets direct path
8. **Update skills/server-ops, AGENTS.md** (10 min) — Claude/Codex know the new paths
9. **Optional: Tailscale Docker sidecar** (15 min) — container-level mesh access

**Total estimated effort:** ~75 minutes of setup, most of it on the Windows PC.

## Success Criteria

- [ ] `ssh cres_admin@100.x.x.x` connects in <1 second from Mac
- [ ] SSH session survives 1+ hours without drops
- [ ] Watchdog auto-restarts a killed container within 90 seconds
- [ ] Uptime Kuma sends phone notification within 2 minutes of a service going down
- [ ] Preflight script reports all-green from Mac
- [ ] Codex on Hetzner VM can reach Admin API via Tailscale IP
- [ ] Cloudflare tunnel failure does NOT break operator/agent access to the server

## Security Notes

- Tailscale uses WireGuard encryption (ChaCha20-Poly1305) for all traffic
- Tailscale ACLs should restrict which devices can reach which ports
- Admin API key auth still required even over Tailscale (defense in depth)
- Windows Firewall rules unchanged — only Tailscale and Cloudflare reach Docker ports
- Tailscale auth keys should be tagged and have expiry policies

## Future Phases (Not In Scope)

- **Phase 2:** Expand Admin API (deploy, rebuild, file ops) — eliminates remaining SSH use cases
- **Phase 3:** Offline resilience (D1 cache strengthening, graceful degradation UI)
- **Phase 4:** Observability (Sentry on gateway, structured logging, centralized metrics)
