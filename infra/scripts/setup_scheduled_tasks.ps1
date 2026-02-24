# AgentOS Nightly Scheduled Tasks
# Run as Administrator to create tasks.
# Usage: .\setup_scheduled_tasks.ps1 -RepoRoot "C:\path\to\gallagher-cres"

param(
    [Parameter(Mandatory=$true)]
    [string]$RepoRoot
)

$ErrorActionPreference = "Stop"

$nodePath = "node"

$memoryCleanupScript = Join-Path $RepoRoot "packages\openai\src\agentos\jobs\memoryCleanup.ts"
$runEvalsScript = Join-Path $RepoRoot "packages\openai\src\agentos\jobs\runEvals.ts"
$buildDatasetScript = Join-Path $RepoRoot "packages\openai\src\agentos\jobs\buildDataset.ts"
$backupAppDbScript = Join-Path $RepoRoot "infra\scripts\backup-app-db.ps1"

$workDir = $RepoRoot
$pnpm = "pnpm"
if (-not (Get-Command "pnpm" -ErrorAction SilentlyContinue)) { $pnpm = "npx" }

# Memory cleanup: daily at 2:00 AM
$memoryTask = @{
    TaskName = "AgentOS-MemoryCleanup"
    Action = New-ScheduledTaskAction -Execute $pnpm -Argument "exec tsx `"$memoryCleanupScript`"" -WorkingDirectory $workDir
    Trigger = New-ScheduledTaskTrigger -Daily -At "2:00AM"
    Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
}
Register-ScheduledTask @memoryTask -Force
Write-Host "Created task: AgentOS-MemoryCleanup (daily 2:00 AM)"

# Eval suite: daily at 3:00 AM
$evalTask = @{
    TaskName = "AgentOS-RunEvals"
    Action = New-ScheduledTaskAction -Execute $pnpm -Argument "exec tsx `"$runEvalsScript`"" -WorkingDirectory $workDir
    Trigger = New-ScheduledTaskTrigger -Daily -At "3:00AM"
    Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
}
Register-ScheduledTask @evalTask -Force
Write-Host "Created task: AgentOS-RunEvals (daily 3:00 AM)"

# Dataset build: weekly on Sunday at 4:00 AM
$datasetTask = @{
    TaskName = "AgentOS-BuildDataset"
    Action = New-ScheduledTaskAction -Execute $pnpm -Argument "exec tsx `"$buildDatasetScript`"" -WorkingDirectory $workDir
    Trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At "4:00AM"
    Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
}
Register-ScheduledTask @datasetTask -Force
Write-Host "Created task: AgentOS-BuildDataset (weekly Sunday 4:00 AM)"

# App DB backup: daily at 1:00 AM (uses docker exec — no host-level pg_dump needed)
$backupTask = @{
    TaskName = "AgentOS-AppDB-Backup"
    Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File `"$backupAppDbScript`""
    Trigger = New-ScheduledTaskTrigger -Daily -At "1:00AM"
    Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
}
Register-ScheduledTask @backupTask -Force
Write-Host "Created task: AgentOS-AppDB-Backup (daily 1:00 AM) — uses docker exec, no extra config needed"

Write-Host "`nCrontab equivalents (Linux/macOS):"
Write-Host "# Memory cleanup: daily at 2:00 AM"
Write-Host "0 2 * * * cd $RepoRoot && npx tsx packages/openai/src/agentos/jobs/memoryCleanup.ts"
Write-Host ""
Write-Host "# Eval suite: daily at 3:00 AM"
Write-Host "0 3 * * * cd $RepoRoot && npx tsx packages/openai/src/agentos/jobs/runEvals.ts"
Write-Host ""
Write-Host "# Dataset build: weekly Sunday at 4:00 AM"
Write-Host "0 4 * * 0 cd $RepoRoot && npx tsx packages/openai/src/agentos/jobs/buildDataset.ts"
Write-Host ""
Write-Host "# App DB backup: daily at 1:00 AM (uses docker exec)"
Write-Host "0 1 * * * cd $RepoRoot && powershell -File infra/scripts/backup-app-db.ps1"
