# Verify backup health for both Postgres databases.
# Usage: .\verify-backups.ps1
# Returns exit code 1 if any backup is stale (>26 hours old) or missing.

param(
    [string]$AppBackupDir = "C:\backups\app-db",
    [string]$PropertyBackupDir = "C:\backups\property-db",
    [int]$StaleHours = 26
)

$errors = @()

function Test-BackupDir {
    param([string]$Dir, [string]$Label)

    if (-not (Test-Path $Dir)) {
        return "$Label backup directory does not exist: $Dir"
    }

    $latest = Get-ChildItem $Dir -Filter "*.sql.gz" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if (-not $latest) {
        return "$Label has no backup files in $Dir"
    }

    $age = (Get-Date) - $latest.LastWriteTime
    $sizeMB = [math]::Round($latest.Length / 1MB, 2)

    if ($age.TotalHours -gt $StaleHours) {
        return "$Label latest backup is stale: $($latest.Name) ($sizeMB MB, $([math]::Round($age.TotalHours, 1))h old)"
    }

    Write-Host "[OK] $Label latest: $($latest.Name) ($sizeMB MB, $([math]::Round($age.TotalHours, 1))h old)"
    return $null
}

$result = Test-BackupDir -Dir $AppBackupDir -Label "App DB"
if ($result) { $errors += $result }

$result = Test-BackupDir -Dir $PropertyBackupDir -Label "Property DB"
if ($result) { $errors += $result }

if ($errors.Count -gt 0) {
    Write-Host ""
    foreach ($err in $errors) {
        Write-Host "[FAIL] $err" -ForegroundColor Red
    }
    exit 1
} else {
    Write-Host ""
    Write-Host "All backups healthy." -ForegroundColor Green
    exit 0
}
