# Nightly backup of Property DB (local-postgis) via docker exec.
# pg_dump runs inside the local-postgis container.
# Usage: .\backup-property-db.ps1 [-BackupDir "C:\backups\property-db"] [-RetentionDays 30]
#
# BG production: local-postgis container, port 5433 external
# Contains: ebr_parcels (198K), soils, wetlands, epa_facilities, fema_flood,
#           ldeq_permits, traffic_counts, mv_parcel_intelligence

param(
    [string]$BackupDir = "C:\backups\property-db",
    [int]$RetentionDays = 30,
    [string]$ContainerName = "local-postgis",
    [string]$DbName = "cres_db",
    [string]$User = "postgres"
)

$ErrorActionPreference = "Stop"

# Verify container is running
$containerState = docker inspect --format '{{.State.Running}}' $ContainerName 2>&1
if ($containerState -ne "True") {
    Write-Error "Container '$ContainerName' is not running"
}

$timestamp = Get-Date -Format "yyyy-MM-dd-HHmm"
$dumpFile = Join-Path $BackupDir "property_db_$timestamp.sql.gz"
$containerTmp = "/tmp/property_db_backup.sql.gz"

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
