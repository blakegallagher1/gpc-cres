# Phase 1: Server Reliability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Tailscale mesh network + Windows watchdog + Uptime Kuma monitoring to eliminate daily server connectivity failures.

**Architecture:** Dual-path networking — Tailscale for private operator/agent access (SSH, Admin API, DB), Cloudflare for public HTTP traffic. Windows watchdog auto-restarts crashed services. Uptime Kuma sends phone alerts.

**Tech Stack:** Tailscale (WireGuard mesh), PowerShell (watchdog), Uptime Kuma (Docker monitoring), Bash (preflight script)

**Design doc:** `docs/plans/2026-03-26-server-reliability-phase1-design.md`

---

## Task 1: Install Tailscale on Windows PC

> This task requires physical/remote access to the Windows PC.

**Files:** None (Windows install)

**Step 1: Download and install Tailscale**

On the Windows PC, open PowerShell as Administrator:

```powershell
# Download installer
Invoke-WebRequest -Uri "https://pkgs.tailscale.com/stable/tailscale-setup-latest.exe" -OutFile "$env:TEMP\tailscale-setup.exe"

# Run installer (silent)
Start-Process -Wait -FilePath "$env:TEMP\tailscale-setup.exe" -ArgumentList "/quiet"
```

Or manually: download from https://tailscale.com/download/windows and run the installer.

**Step 2: Authenticate Tailscale**

```powershell
# Open Tailscale and sign in (browser opens automatically)
& "C:\Program Files\Tailscale\tailscale.exe" up
```

Sign in with Google SSO or email. Create a new Tailscale account if needed at https://login.tailscale.com.

**Step 3: Verify Tailscale is running and note the IP**

```powershell
tailscale status
# Output will show something like:
# 100.64.0.1   windows-pc   blake@   windows  -
```

**Write down the Tailscale IP** (e.g., `100.64.0.1`). This is the stable IP that never changes.

**Step 4: Ensure Tailscale starts on boot**

```powershell
# Verify the Tailscale service is set to automatic
Get-Service Tailscale | Select-Object Name, StartType, Status
# If not automatic:
Set-Service -Name Tailscale -StartupType Automatic
```

**Step 5: Open Windows Firewall for Tailscale interface**

Tailscale creates a virtual network adapter. Docker ports need to be accessible on it:

```powershell
# Allow inbound on Tailscale interface for Docker services
New-NetFirewallRule -DisplayName "GPC Tailscale - Gateway" -Direction Inbound -InterfaceAlias "Tailscale" -LocalPort 8000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "GPC Tailscale - Martin" -Direction Inbound -InterfaceAlias "Tailscale" -LocalPort 3000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "GPC Tailscale - Postgres" -Direction Inbound -InterfaceAlias "Tailscale" -LocalPort 5432 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "GPC Tailscale - Qdrant" -Direction Inbound -InterfaceAlias "Tailscale" -LocalPort 6333 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "GPC Tailscale - CUA" -Direction Inbound -InterfaceAlias "Tailscale" -LocalPort 3001 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "GPC Tailscale - SSH" -Direction Inbound -InterfaceAlias "Tailscale" -LocalPort 22 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "GPC Tailscale - Uptime Kuma" -Direction Inbound -InterfaceAlias "Tailscale" -LocalPort 3003 -Protocol TCP -Action Allow
```

**Step 6: Verify Docker ports are accessible via Tailscale IP**

From the same Windows PC:

```powershell
# Test gateway via Tailscale IP
curl http://100.64.0.1:8000/health
# Expected: {"status": "ok"} or similar

# Test Martin
curl http://100.64.0.1:3000/health
# Expected: OK
```

**Step 7: Verify**

Run: `tailscale status`
Expected: Shows Windows PC online with a `100.x.x.x` IP, status "active".

---

## Task 2: Install Tailscale on Mac

**Files:** None (Mac install)

**Step 1: Install Tailscale**

```bash
brew install --cask tailscale
```

Or download from https://tailscale.com/download/mac (App Store version also works).

**Step 2: Launch and authenticate**

Open Tailscale from Applications or menu bar. Sign in with the **same account** used on the Windows PC.

**Step 3: Verify mesh connectivity**

```bash
# Check Tailscale status
tailscale status
# Should show both Mac and Windows PC

# Ping Windows PC via Tailscale
tailscale ping 100.64.0.1  # Use the IP from Task 1 Step 3
# Expected: pong from 100.64.0.1 via DERP(xxx) in Xms
# Or: pong from 100.64.0.1 via [direct] in Xms (even better)
```

**Step 4: Test direct service access**

```bash
# Gateway health — no Cloudflare in the path
curl -s http://100.64.0.1:8000/health | jq
# Expected: gateway health response

# SSH — direct WireGuard, no websocket proxy
ssh -o ConnectTimeout=3 cres_admin@100.64.0.1 "echo 'Tailscale SSH works!'"
# Expected: "Tailscale SSH works!" with sub-second connection

# Database — direct TCP, no cloudflared tunnel
psql -h 100.64.0.1 -p 5432 -U postgres -d entitlement_os -c "SELECT count(*) FROM ebr_parcels"
# Expected: ~560000 rows
```

**Step 5: Set environment variable**

Add to `~/.zshrc`:

```bash
export GPC_TAILSCALE_IP="100.64.0.1"  # Replace with actual IP from Task 1
```

Then: `source ~/.zshrc`

**Step 6: Verify**

Run: `ping -c 3 $GPC_TAILSCALE_IP`
Expected: 3 packets received, <20ms round-trip time.

---

## Task 3: Update SSH Config for Dual-Path Access

**Files:**
- Modify: `~/.ssh/config`

**Step 1: Add Tailscale and fallback SSH entries**

Add these entries to `~/.ssh/config` (keep existing `ssh.gallagherpropco.com` entry as fallback):

```
# Tailscale direct — primary path (WireGuard, no websocket)
Host bg-ts
    HostName 100.64.0.1
    User cres_admin
    ConnectTimeout 5
    ServerAliveInterval 30
    ServerAliveCountMax 3

# Cloudflare tunnel — fallback path
Host bg-cf
    HostName ssh.gallagherpropco.com
    User cres_admin
    ProxyCommand cloudflared access ssh --hostname ssh.gallagherpropco.com
    ConnectTimeout 10

# Default: Tailscale primary
Host bg
    HostName 100.64.0.1
    User cres_admin
    ConnectTimeout 3
    ServerAliveInterval 30
    ServerAliveCountMax 3
```

**Step 2: Test both paths**

```bash
# Tailscale (should be fast, <1s)
ssh bg-ts "echo tailscale-ok"

# Cloudflare fallback (slower, 2-5s)
ssh bg-cf "echo cloudflare-ok"

# Default alias
ssh bg "echo default-ok"
```

**Step 3: Verify**

Run: `ssh bg "uptime"`
Expected: Connects in <1 second, shows Windows uptime, no drops.

---

## Task 4: Deploy Watchdog Script to Windows PC

> This task requires SSH access to the Windows PC (use `ssh bg` from Task 3).

**Files:**
- Create: `C:\gpc-cres-backend\scripts\watchdog.ps1` (on Windows PC)
- Create: `C:\gpc-cres-backend\logs\` directory (on Windows PC)
- Create: `scripts/watchdog/watchdog.ps1` (repo copy for version control)

**Step 1: Create the watchdog script in the repo**

Create: `scripts/watchdog/watchdog.ps1`

```powershell
# GPC Backend Watchdog — runs every 60 seconds as a Scheduled Task
# Checks critical services and auto-restarts them if down.

$logDir = "C:\gpc-cres-backend\logs"
$logFile = "$logDir\watchdog.log"
$heartbeatFile = "$logDir\heartbeat.txt"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# Ensure log directory exists
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

function Log($msg) {
    "$timestamp | $msg" | Out-File -Append $logFile -Encoding utf8
}

# --- 1. Windows Services ---

$services = @(
    @{ Name = "sshd"; Label = "OpenSSH Server" },
    @{ Name = "Tailscale"; Label = "Tailscale" }
)

foreach ($svc in $services) {
    $s = Get-Service -Name $svc.Name -ErrorAction SilentlyContinue
    if ($s -and $s.Status -ne 'Running') {
        Log "RESTART: $($svc.Label) was $($s.Status)"
        try {
            Start-Service $svc.Name -ErrorAction Stop
            Log "OK: $($svc.Label) restarted"
        } catch {
            Log "FAIL: Could not restart $($svc.Label): $_"
        }
    }
}

# --- 2. Docker Desktop ---

$dockerProcess = Get-Process "Docker Desktop" -ErrorAction SilentlyContinue
if (-not $dockerProcess) {
    Log "RESTART: Docker Desktop not running"
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    # Wait for Docker to initialize before checking containers
    Start-Sleep -Seconds 45
}

# --- 3. Docker Containers ---

$containers = @("gateway", "martin", "entitlement-os-postgres", "cloudflared", "gpc-cua-worker", "qdrant")

foreach ($c in $containers) {
    $status = $null
    try {
        $status = (docker inspect --format='{{.State.Status}}' $c 2>&1)
    } catch {}

    if ($status -ne "running") {
        Log "RESTART: container '$c' status='$status'"
        try {
            docker start $c 2>&1 | Out-Null
            Log "OK: container '$c' started"
        } catch {
            Log "FAIL: Could not start container '$c': $_"
        }
    }
}

# --- 4. Gateway Functional Health Check ---

try {
    $resp = Invoke-WebRequest -Uri "http://localhost:8000/health" -TimeoutSec 5 -UseBasicParsing
    if ($resp.StatusCode -ne 200) {
        Log "RESTART: gateway health returned $($resp.StatusCode)"
        docker restart gateway 2>&1 | Out-Null
    }
} catch {
    Log "RESTART: gateway health unreachable"
    docker restart gateway 2>&1 | Out-Null
}

# --- 5. Log Rotation (keep 7 days) ---

$cutoff = (Get-Date).AddDays(-7)
Get-ChildItem "$logDir\watchdog-*.log" -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    Remove-Item -Force

# Rotate current log if > 1MB
if ((Test-Path $logFile) -and (Get-Item $logFile).Length -gt 1MB) {
    $archiveName = "watchdog-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
    Move-Item $logFile "$logDir\$archiveName" -Force
}

# --- 6. Heartbeat ---

$timestamp | Out-File $heartbeatFile -Force -Encoding utf8
```

**Step 2: Deploy to Windows PC**

```bash
# From Mac, SCP the script to Windows PC via Tailscale
scp scripts/watchdog/watchdog.ps1 bg:C:/gpc-cres-backend/scripts/watchdog.ps1
```

**Step 3: Create the logs directory on Windows PC**

```bash
ssh bg "mkdir -p C:\gpc-cres-backend\logs"
```

**Step 4: Test the script manually**

```bash
ssh bg "powershell -ExecutionPolicy Bypass -File C:\gpc-cres-backend\scripts\watchdog.ps1"
# Then check the heartbeat
ssh bg "type C:\gpc-cres-backend\logs\heartbeat.txt"
# Expected: current timestamp
```

**Step 5: Commit the repo copy**

```bash
git add scripts/watchdog/watchdog.ps1
git commit -m "feat(ops): add Windows watchdog script for service auto-recovery"
```

---

## Task 5: Register Watchdog as Windows Scheduled Task

> Requires SSH to Windows PC with admin access.

**Files:** None (Windows Task Scheduler config)

**Step 1: Register the scheduled task**

```bash
ssh bg
```

Then on Windows:

```powershell
# Remove existing task if re-running
Unregister-ScheduledTask -TaskName "GPC-Watchdog" -Confirm:$false -ErrorAction SilentlyContinue

# Create the task
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File C:\gpc-cres-backend\scripts\watchdog.ps1"

$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Seconds 60) `
    -RepetitionDuration ([TimeSpan]::MaxValue)

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteryPower `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest

Register-ScheduledTask -TaskName "GPC-Watchdog" `
    -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description "GPC Backend Watchdog - auto-restarts sshd, Tailscale, Docker, containers every 60s"
```

**Step 2: Verify the task is registered and running**

```powershell
Get-ScheduledTask -TaskName "GPC-Watchdog" | Select-Object TaskName, State
# Expected: State = Ready or Running

# Check it ran at least once
type C:\gpc-cres-backend\logs\heartbeat.txt
# Expected: timestamp within last 60 seconds
```

**Step 3: Test auto-recovery by killing a container**

```powershell
# Kill gateway
docker stop gateway

# Wait 90 seconds, then check
Start-Sleep -Seconds 90
docker ps --format "table {{.Names}}\t{{.Status}}" | findstr gateway
# Expected: gateway is running again (restarted by watchdog)

# Check the watchdog log
type C:\gpc-cres-backend\logs\watchdog.log
# Expected: "RESTART: container 'gateway' status='exited'" followed by "OK: container 'gateway' started"
```

**Step 4: Verify**

Run from Mac: `ssh bg "type C:\gpc-cres-backend\logs\heartbeat.txt"`
Expected: Timestamp within last 60 seconds.

---

## Task 6: Add Uptime Kuma to Docker Compose

> Requires SSH to Windows PC to edit docker-compose.yml.

**Files:**
- Modify: `C:\gpc-cres-backend\docker-compose.yml` (on Windows PC)

**Step 1: Add Uptime Kuma service to docker-compose.yml**

SSH to the Windows PC and edit docker-compose.yml:

```bash
ssh bg
```

Add this service block (use port 3003 to avoid CUA worker conflict on 3001):

```yaml
  uptime-kuma:
    image: louislam/uptime-kuma:1
    container_name: gpc-uptime-kuma
    restart: unless-stopped
    volumes:
      - uptime-kuma-data:/app/data
    ports:
      - "0.0.0.0:3003:3001"
    networks:
      - internal
```

Add to the `volumes:` section at the bottom:

```yaml
  uptime-kuma-data:
```

Also add `"gpc-uptime-kuma"` to the watchdog's container list in `C:\gpc-cres-backend\scripts\watchdog.ps1`.

**Step 2: Start Uptime Kuma**

```powershell
cd C:\gpc-cres-backend
docker compose up -d uptime-kuma
```

**Step 3: Verify it's running**

```bash
# From Mac via Tailscale
curl -s -o /dev/null -w "%{http_code}" http://$GPC_TAILSCALE_IP:3003
# Expected: 200
```

**Step 4: Initial setup**

Open in browser: `http://<TAILSCALE_IP>:3003`

1. Create admin account (username + password)
2. This is the monitoring dashboard — configure monitors in the next task

**Step 5: Verify**

Run: `docker ps --format "table {{.Names}}\t{{.Status}}" | findstr uptime`
Expected: `gpc-uptime-kuma   Up X minutes (healthy)`

---

## Task 7: Configure Uptime Kuma Monitors

> This task is done in the Uptime Kuma web UI.

**Files:** None (UI configuration)

**Step 1: Open Uptime Kuma dashboard**

Open: `http://<TAILSCALE_IP>:3003` in your browser.

**Step 2: Add notification channel**

Go to Settings > Notifications > Setup Notification:
- **Type:** Ntfy (free, no account needed) or Pushover or Telegram
- **For Ntfy:** Topic = `gpc-alerts`, Server = `https://ntfy.sh`
- Install the Ntfy app on your phone and subscribe to `gpc-alerts` topic
- Test the notification

**Step 3: Add monitors**

Click "Add New Monitor" for each:

| Name | Type | URL / Host | Interval | Retry | Notes |
|------|------|-----------|----------|-------|-------|
| Gateway Health | HTTP(s) | `http://gateway:8000/health` | 30s | 3 | Keyword: "ok" |
| Martin Tiles | HTTP(s) | `http://martin:3000/health` | 60s | 2 | Keyword: "OK" |
| PostgreSQL | TCP Port | Host: `entitlement-os-postgres`, Port: `5432` | 30s | 3 | |
| Qdrant | HTTP(s) | `http://qdrant:6333/dashboard` | 60s | 2 | |
| CUA Worker | HTTP(s) | `http://gpc-cua-worker:3001/health` | 60s | 2 | |
| CF Tunnel (external) | HTTP(s) | `https://api.gallagherpropco.com/health` | 60s | 3 | Tests full CF path |
| Vercel Frontend | HTTP(s) | `https://gallagherpropco.com` | 120s | 2 | |
| Watchdog Heartbeat | Push | (auto-generated URL) | Heartbeat interval: 90s | | See Step 4 |

For each monitor: enable the notification channel created in Step 2.

**Step 4: Set up watchdog heartbeat push monitor**

1. Add a "Push" type monitor named "Watchdog Heartbeat"
2. Set heartbeat interval to 90 seconds (watchdog runs every 60s, so 90s allows one miss)
3. Copy the push URL (looks like `http://localhost:3001/api/push/XXXX?status=up&msg=OK`)
4. Add this line to the END of `C:\gpc-cres-backend\scripts\watchdog.ps1` (before the heartbeat write):

```powershell
# --- 7. Uptime Kuma Push Heartbeat ---
try {
    Invoke-WebRequest -Uri "http://localhost:3003/api/push/XXXX?status=up&msg=OK&ping=" -TimeoutSec 5 -UseBasicParsing | Out-Null
} catch {}
```

Replace `XXXX` with the actual push token from the Uptime Kuma URL.

**Step 5: Verify**

All monitors should show green after 2-3 minutes. Test an alert by stopping a container:

```bash
ssh bg "docker stop martin"
# Wait 60 seconds — phone should get a notification
ssh bg "docker start martin"
# Monitor returns to green
```

---

## Task 8: Add Preflight Script to Repo

**Files:**
- Create: `scripts/server-preflight.sh`

**Step 1: Create the preflight script**

Create: `scripts/server-preflight.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; FAILURES=$((FAILURES + 1)); }
warn() { echo -e "${YELLOW}!${NC} $1"; }

FAILURES=0
TS_IP="${GPC_TAILSCALE_IP:-}"

if [ -z "$TS_IP" ]; then
    echo "Error: GPC_TAILSCALE_IP not set. Add to ~/.zshrc:"
    echo '  export GPC_TAILSCALE_IP="100.x.x.x"'
    exit 1
fi

echo "=== GPC Server Preflight ==="
echo "Tailscale IP: $TS_IP"
echo ""

# 1. Tailscale mesh
echo "--- Tailscale ---"
if tailscale ping "$TS_IP" --timeout 3s &>/dev/null 2>&1; then
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
if command -v pg_isready &>/dev/null; then
    if pg_isready -h "$TS_IP" -p 5432 -t 3 &>/dev/null; then
        pass "PostgreSQL: Accepting connections"
    else
        fail "PostgreSQL: Not responding"
    fi
else
    # Fallback: test TCP port
    if nc -z -w3 "$TS_IP" 5432 &>/dev/null 2>&1; then
        pass "PostgreSQL: Port open (pg_isready not installed)"
    else
        fail "PostgreSQL: Port 5432 unreachable"
    fi
fi

# 6. CUA Worker
if curl -sf --max-time 5 "http://$TS_IP:3001/health" &>/dev/null; then
    pass "CUA Worker: Healthy"
else
    warn "CUA Worker: Not responding (may be expected)"
fi

# 7. Uptime Kuma
if curl -sf --max-time 5 "http://$TS_IP:3003" &>/dev/null; then
    pass "Uptime Kuma: Dashboard accessible"
else
    warn "Uptime Kuma: Not responding"
fi

# 8. Cloudflare tunnel (external path)
echo "--- Cloudflare (public path) ---"
if curl -sf --max-time 8 "https://api.gallagherpropco.com/health" &>/dev/null; then
    pass "Cloudflare Tunnel: Public gateway reachable"
else
    warn "Cloudflare Tunnel: Public gateway unreachable (Tailscale path still works)"
fi

echo ""
if [ $FAILURES -eq 0 ]; then
    echo -e "${GREEN}All systems operational.${NC}"
else
    echo -e "${RED}$FAILURES check(s) failed. See above.${NC}"
    exit 1
fi
```

**Step 2: Make executable**

```bash
chmod +x scripts/server-preflight.sh
```

**Step 3: Test it**

```bash
./scripts/server-preflight.sh
# Expected: All green checks (after Tasks 1-7 are done)
```

**Step 4: Add shell alias**

Add to `~/.zshrc`:

```bash
alias preflight="./scripts/server-preflight.sh"
```

**Step 5: Commit**

```bash
git add scripts/server-preflight.sh
git commit -m "feat(ops): add server preflight check script for dual-path diagnostics"
```

---

## Task 9: Update server-ops Skill with Tailscale Paths

**Files:**
- Modify: `skills/server-ops/SKILL.md`

**Step 1: Update the Architecture Overview section**

In `skills/server-ops/SKILL.md`, update the architecture diagram to show dual-path:

Replace the existing architecture diagram with:

```
DUAL-PATH ARCHITECTURE:

Public Traffic (Cloudflare):
  Internet → Cloudflare Tunnel → Docker Compose Stack

Operator/Agent Traffic (Tailscale):
  Mac/Codex VM → WireGuard P2P → Windows PC (100.x.x.x)
  Direct: SSH, Docker, Postgres, Admin API, Uptime Kuma
```

**Step 2: Update Connection Methods to show Tailscale as primary**

Add a new section at the top of "Connection Methods" before the Admin API section:

```markdown
### 0. Tailscale Direct (FASTEST — peer-to-peer WireGuard)

All services are directly accessible via the Windows PC's Tailscale IP.
Set `GPC_TAILSCALE_IP` in `~/.zshrc`.

| Service | Tailscale URL | Cloudflare Fallback |
|---------|--------------|-------------------|
| Admin API | `http://$GPC_TAILSCALE_IP:8000/admin` | `https://api.gallagherpropco.com/admin` |
| Gateway API | `http://$GPC_TAILSCALE_IP:8000` | `https://api.gallagherpropco.com` |
| SSH | `ssh cres_admin@$GPC_TAILSCALE_IP` | `ssh bg-cf` |
| PostgreSQL | `psql -h $GPC_TAILSCALE_IP -p 5432` | `cloudflared access tcp ...` |
| Tiles | `http://$GPC_TAILSCALE_IP:3000` | `https://tiles.gallagherpropco.com` |
| CUA Worker | `http://$GPC_TAILSCALE_IP:3001` | `https://cua.gallagherpropco.com` |
| Uptime Kuma | `http://$GPC_TAILSCALE_IP:3003` | (Tailscale only) |

Run `scripts/server-preflight.sh` to check all paths before starting work.
```

**Step 3: Add Watchdog and Uptime Kuma sections**

Add to the "Common Failure Modes & Recovery" section:

```markdown
### 9. Watchdog & Monitoring

**Watchdog** runs every 60s as a Windows Scheduled Task (`GPC-Watchdog`).
Auto-restarts: sshd, Tailscale, Docker Desktop, all containers, gateway (health check).
Logs: `C:\gpc-cres-backend\logs\watchdog.log`
Heartbeat: `C:\gpc-cres-backend\logs\heartbeat.txt`

**Uptime Kuma** dashboard: `http://$GPC_TAILSCALE_IP:3003`
Monitors all services + Cloudflare tunnel + Vercel frontend.
Sends push notifications on failure.
```

**Step 4: Commit**

```bash
git add skills/server-ops/SKILL.md
git commit -m "docs(server-ops): add Tailscale dual-path and watchdog/monitoring sections"
```

---

## Task 10: Update AGENTS.md for Codex Awareness

**Files:**
- Modify: `AGENTS.md`

**Step 1: Update the Server Access section**

In the "Server Access (Windows 11 Backend)" section of `AGENTS.md`, add Tailscale as the primary path. Add before the existing "Admin API" section:

```markdown
**Dual-path networking:** Tailscale mesh (primary, direct WireGuard) + Cloudflare Tunnel (fallback, public HTTP).

**Tailscale direct access (preferred — fastest, most reliable):**
```bash
# All services via Tailscale IP (set GPC_TAILSCALE_IP in env)
curl http://$GPC_TAILSCALE_IP:8000/health          # Gateway
ssh cres_admin@$GPC_TAILSCALE_IP                    # SSH (no websocket proxy)
psql -h $GPC_TAILSCALE_IP -p 5432 -U postgres       # Database (direct TCP)
curl http://$GPC_TAILSCALE_IP:3003                   # Uptime Kuma dashboard
```

**Self-healing:** Windows watchdog (GPC-Watchdog Scheduled Task) auto-restarts sshd, Tailscale, Docker, and all containers every 60s. Uptime Kuma sends push notifications on failure.

**Preflight check:** Run `scripts/server-preflight.sh` before any server work session.
```

**Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): add Tailscale primary path and watchdog awareness for Codex"
```

---

## Task 11: Install Tailscale on Codex VM (Hetzner)

> This task requires SSH access to the Codex VM at 5.161.99.123.

**Files:** None (VM install)

**Step 1: Install Tailscale on the VM**

```bash
ssh controller@5.161.99.123

# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
```

**Step 2: Generate a pre-auth key**

Go to https://login.tailscale.com/admin/settings/keys and create a reusable auth key. Copy it.

**Step 3: Authenticate with pre-auth key**

```bash
sudo tailscale up --authkey=tskey-auth-XXXXX
```

**Step 4: Verify connectivity to Windows PC**

```bash
tailscale ping 100.64.0.1  # Windows PC Tailscale IP
# Expected: pong in <50ms

curl -s http://100.64.0.1:8000/health
# Expected: gateway health response
```

**Step 5: Update Codex controller environment**

If the Codex controller uses `ADMIN_API_KEY` or calls the Admin API, update its config to prefer the Tailscale IP:

```bash
# In the controller's environment or config:
GPC_TAILSCALE_IP=100.64.0.1
ADMIN_URL=http://100.64.0.1:8000/admin
```

**Step 6: Verify**

Run: `tailscale status` on the VM.
Expected: Shows VM, Mac, and Windows PC all connected.

---

## Task 12: Final Verification — Run All Success Criteria

**Files:** None

**Step 1: SSH reliability test**

```bash
# From Mac — connect via Tailscale, should be instant
time ssh bg "echo connected"
# Expected: real < 1.0s
```

**Step 2: Long SSH session test**

```bash
# Open an SSH session and leave it for 10+ minutes
ssh bg
# Run a command every few minutes to verify it stays alive
watch -n 60 "date && docker ps --format 'table {{.Names}}\t{{.Status}}'"
# Expected: No drops for 10+ minutes (Cloudflare SSH would typically drop)
```

**Step 3: Watchdog auto-recovery test**

```bash
# Kill a container from Mac
ssh bg "docker stop martin"
echo "Waiting 90 seconds for watchdog..."
sleep 90
ssh bg "docker ps --format '{{.Names}} {{.Status}}' | findstr martin"
# Expected: martin is running again
ssh bg "type C:\gpc-cres-backend\logs\watchdog.log | findstr martin"
# Expected: RESTART + OK log entries
```

**Step 4: Uptime Kuma alert test**

```bash
# Stop gateway briefly
ssh bg "docker stop gateway"
# Wait for phone notification (should arrive within 60-90 seconds)
# Then restart
ssh bg "docker start gateway"
# Verify Uptime Kuma shows recovery
```

**Step 5: Preflight script**

```bash
./scripts/server-preflight.sh
# Expected: All green checks
```

**Step 6: Cloudflare independence test**

```bash
# Stop cloudflared to simulate tunnel failure
ssh bg "docker stop cloudflared"

# Verify Tailscale path still works
curl -s http://$GPC_TAILSCALE_IP:8000/health
# Expected: Still works! Independent path.

ssh bg "echo 'Tailscale survives Cloudflare failure'"
# Expected: Works

# Restart cloudflared
ssh bg "docker start cloudflared"
```

**Step 7: Commit final state**

```bash
git add -A
git commit -m "feat(ops): complete Phase 1 server reliability (Tailscale + watchdog + monitoring)

- Tailscale mesh: Mac, Windows PC, Codex VM connected via WireGuard
- Watchdog: auto-restarts sshd, Tailscale, Docker, containers every 60s
- Uptime Kuma: monitors all services, phone push notifications
- Preflight script: dual-path health check before sessions
- server-ops skill and AGENTS.md updated with Tailscale paths"
```

---

## Checklist Summary

- [ ] Task 1: Tailscale installed on Windows PC + firewall rules
- [ ] Task 2: Tailscale installed on Mac + mesh verified
- [ ] Task 3: SSH config updated for dual-path
- [ ] Task 4: Watchdog script deployed to Windows PC
- [ ] Task 5: Watchdog registered as Scheduled Task
- [ ] Task 6: Uptime Kuma added to Docker Compose
- [ ] Task 7: Uptime Kuma monitors + phone notifications configured
- [ ] Task 8: Preflight script added to repo
- [ ] Task 9: server-ops skill updated with Tailscale paths
- [ ] Task 10: AGENTS.md updated for Codex awareness
- [ ] Task 11: Tailscale installed on Codex VM
- [ ] Task 12: All success criteria verified
