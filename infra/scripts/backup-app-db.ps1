# Nightly backup of entitlement_os Postgres to local dir + optional B2 sync.
# Requires: APP_DB_PASSWORD env var (or pass via -Password).
# Usage: .\backup-app-db.ps1 [-BackupDir "C:\backups\app-db"] [-RetentionDays 30]
#
# Production: app-db on localhost:5433 (C:\gpc-cres-backend)
# Local dev: postgres on localhost:54323 (infra/docker)

param(
    [string]$BackupDir = "C:\backups\app-db",
    [int]$RetentionDays = 30,
    [string]$Host = "localhost",
    [int]$Port = 5433,
    [string]$DbName = "entitlement_os",
    [string]$User = "postgres",
    [string]$Password = $env:APP_DB_PASSWORD
)

$ErrorActionPreference = "Stop"

if (-not $Password) {
    Write-Error "Set APP_DB_PASSWORD or pass -Password"
}

$timestamp = Get-Date -Format "yyyy-MM-dd-HHmm"
$dumpFile = Join-Path $BackupDir "entitlement_os_$timestamp.sql.gz"

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$env:PGPASSWORD = $Password

Write-Host "Backing up $DbName from ${Host}:${Port}..."
try {
    pg_dump -h $Host -p $Port -U $User -d $DbName 2>$null | gzip > $dumpFile
} catch {
    Write-Error "pg_dump failed: $_"
}

if (Test-Path $dumpFile) {
    $sizeMB = [math]::Round((Get-Item $dumpFile).Length / 1MB, 2)
    Write-Host "Backup complete: $dumpFile ($sizeMB MB)"
} else {
    Write-Error "Backup file was not created"
}

# Prune old backups
Get-ChildItem $BackupDir -Filter "*.sql.gz" -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } |
    ForEach-Object {
        Write-Host "Removing old backup: $($_.Name)"
        Remove-Item $_.FullName -Force
    }

# Optional: sync to B2 for off-site redundancy
# b2 sync $BackupDir b2://your-bucket/backups/app-db/
