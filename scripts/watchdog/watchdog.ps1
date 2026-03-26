# GPC Backend Watchdog — runs every 60 seconds as a Windows Scheduled Task
# Checks critical services and auto-restarts them if down.
# Logs to C:\gpc-cres-backend\logs\watchdog.log

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
    Start-Sleep -Seconds 45
}

# --- 3. Docker Containers ---

$containers = @(
    "fastapi-gateway",
    "martin-tile-server",
    "entitlement-os-postgres",
    "cloudflared-tunnel",
    "gpc-cua-worker",
    "qdrant"
)

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
        docker restart fastapi-gateway 2>&1 | Out-Null
    }
} catch {
    Log "RESTART: gateway health unreachable"
    docker restart fastapi-gateway 2>&1 | Out-Null
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
