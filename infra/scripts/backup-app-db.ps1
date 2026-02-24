# Nightly backup of entitlement_os Postgres via docker exec.
# pg_dump runs inside the entitlement-os-postgres container (not on host).
# Usage: .\backup-app-db.ps1 [-BackupDir "C:\backups\app-db"] [-RetentionDays 30]
#
# BG production: entitlement-os-postgres container, port 54323 external
# Dump + gzip happen inside container, then docker cp extracts the file.

param(
    [string]$BackupDir = "C:\backups\app-db",
    [int]$RetentionDays = 30,
    [string]$ContainerName = "entitlement-os-postgres",
    [string]$DbName = "entitlement_os",
    [string]$User = "postgres"
)

$ErrorActionPreference = "Stop"

# Verify container is running
$containerState = docker inspect --format '{{.State.Running}}' $ContainerName 2>&1
if ($containerState -ne "True") {
    Write-Error "Container '$ContainerName' is not running"
}

$timestamp = Get-Date -Format "yyyy-MM-dd-HHmm"
$dumpFile = Join-Path $BackupDir "entitlement_os_$timestamp.sql.gz"
$containerTmp = "/tmp/entitlement_os_backup.sql.gz"

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

Write-Host "Backing up $DbName from container $ContainerName..."
try {
    # Dump + gzip inside the container (avoids needing pg_dump/gzip on host)
    docker exec $ContainerName bash -c "pg_dump -U $User $DbName | gzip > $containerTmp"
    if ($LASTEXITCODE -ne 0) { throw "pg_dump inside container failed (exit code $LASTEXITCODE)" }

    # Copy compressed dump from container to host
    docker cp "${ContainerName}:${containerTmp}" $dumpFile
    if ($LASTEXITCODE -ne 0) { throw "docker cp failed (exit code $LASTEXITCODE)" }

    # Clean up temp file inside container
    docker exec $ContainerName rm -f $containerTmp
} catch {
    # Clean up container temp on failure
    docker exec $ContainerName rm -f $containerTmp 2>$null
    Write-Error "Backup failed: $_"
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
# b2 sync $BackupDir b2://gallagher-documents/backups/app-db/
