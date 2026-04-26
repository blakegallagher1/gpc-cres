# Register the nightly property DB backup task on the Windows gateway host.
#
# Usage:
#   .\register-property-db-backup-task.ps1
#   .\register-property-db-backup-task.ps1 -DailyAt "02:30" -RunNow

param(
    [string]$TaskName = "GPC Property DB Backup",
    [string]$ScriptPath = "C:\gpc-cres-backend\infra\scripts\backup-property-db.ps1",
    [string]$BackupDir = "C:\gpc-cres-backups\property-db",
    [string]$DailyAt = "02:30",
    [int]$RetentionDays = 30,
    [switch]$RunNow
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ScriptPath)) {
    throw "Backup script not found at $ScriptPath"
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$taskAction = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`" -BackupDir `"$BackupDir`" -RetentionDays $RetentionDays"
schtasks.exe /Create /TN $TaskName /TR $taskAction /SC DAILY /ST $DailyAt /F /RL HIGHEST | Out-Host
if ($LASTEXITCODE -ne 0) {
    throw "Failed to register scheduled task $TaskName"
}

if ($RunNow) {
    schtasks.exe /Run /TN $TaskName | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to start scheduled task $TaskName"
    }
}

schtasks.exe /Query /TN $TaskName /FO LIST | Out-Host
