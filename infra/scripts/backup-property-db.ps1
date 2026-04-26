# Nightly backup of the live Property DB.
# Runs on the Windows gateway host and uses pg_dump inside the Postgres container.
#
# Usage:
#   .\backup-property-db.ps1
#   .\backup-property-db.ps1 -BackupDir "C:\gpc-cres-backups\property-db" -RetentionDays 30
#
# Output:
#   property-db-<timestamp>.dump
#   property-db-<timestamp>.manifest.json

param(
    [string]$BackupDir = "C:\gpc-cres-backups\property-db",
    [int]$RetentionDays = 30,
    [string]$ContainerName = "entitlement-os-postgres",
    [string]$DbName = "entitlement_os",
    [string]$User = "postgres",
    [string]$ContractVersion = "property-db-contract-v1",
    [int]$MinimumEastBatonRougeRows = 150000
)

$ErrorActionPreference = "Stop"

function Invoke-ContainerPsqlScalar {
    param([string]$Sql)

    $result = docker exec $ContainerName psql -U $User -d $DbName -At -v ON_ERROR_STOP=1 -c $Sql
    if ($LASTEXITCODE -ne 0) {
        throw "psql failed for query: $Sql"
    }
    return ($result | Select-Object -First 1).Trim()
}

function Assert-PropertyDbContract {
    $viewExists = Invoke-ContainerPsqlScalar "SELECT to_regclass('property.parcels') IS NOT NULL"
    if ($viewExists -ne "t") {
        throw "property.parcels contract view is missing"
    }

    $indexExists = Invoke-ContainerPsqlScalar "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'ebr_parcels' AND indexname = 'idx_ebr_parcels_parish_parcel_id')"
    if ($indexExists -ne "t") {
        throw "idx_ebr_parcels_parish_parcel_id is missing"
    }

    $liveContract = Invoke-ContainerPsqlScalar "SELECT version FROM property.contract_versions WHERE contract_key = 'property.parcels'"
    if ($liveContract -ne $ContractVersion) {
        throw "Expected contract $ContractVersion but found $liveContract"
    }

    $ebrRowsText = Invoke-ContainerPsqlScalar "SELECT COUNT(*)::bigint FROM public.ebr_parcels WHERE parish = 'East Baton Rouge'"
    $ebrRows = [int64]$ebrRowsText
    if ($ebrRows -lt $MinimumEastBatonRougeRows) {
        throw "East Baton Rouge row count too low: $ebrRows"
    }

    return $ebrRows
}

function Read-ParishCounts {
    $rows = docker exec $ContainerName psql -U $User -d $DbName -At -v ON_ERROR_STOP=1 -F "`t" -c "SELECT coalesce(parish, ''), COUNT(*)::bigint FROM public.ebr_parcels GROUP BY parish ORDER BY COUNT(*) DESC"
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to read parish counts"
    }

    $counts = @()
    foreach ($row in $rows) {
        if (-not $row) { continue }
        $parts = $row -split "`t", 2
        $parish = if ($parts[0] -eq "") { $null } else { $parts[0] }
        $counts += [ordered]@{
            parish = $parish
            rowCount = [int64]$parts[1]
        }
    }
    return $counts
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$containerState = docker inspect --format '{{.State.Running}}' $ContainerName 2>&1
if ($containerState -ne "True") {
    throw "Container '$ContainerName' is not running"
}

$generatedAt = (Get-Date).ToUniversalTime()
$timestamp = $generatedAt.ToString("yyyy-MM-ddTHH-mm-ssZ")
$dumpName = "property-db-$timestamp.dump"
$manifestName = "property-db-$timestamp.manifest.json"
$dumpFile = Join-Path $BackupDir $dumpName
$manifestFile = Join-Path $BackupDir $manifestName
$containerTmp = "/tmp/$dumpName"

Write-Host "Verifying property DB contract before backup..."
$ebrRows = Assert-PropertyDbContract
$parishCounts = Read-ParishCounts

Write-Host "Backing up $DbName from container $ContainerName..."
try {
    docker exec $ContainerName pg_dump -U $User -d $DbName -Fc --no-owner --no-acl -f $containerTmp
    if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }

    docker cp "${ContainerName}:${containerTmp}" $dumpFile
    if ($LASTEXITCODE -ne 0) { throw "docker cp failed with exit code $LASTEXITCODE" }
} finally {
    docker exec $ContainerName rm -f $containerTmp 2>$null | Out-Null
}

if (-not (Test-Path $dumpFile)) {
    throw "Backup file was not created"
}

$dumpItem = Get-Item $dumpFile
$hash = (Get-FileHash -Algorithm SHA256 -Path $dumpFile).Hash.ToLowerInvariant()
$manifest = [ordered]@{
    generatedAt = $generatedAt.ToString("o")
    contractVersion = $ContractVersion
    source = [ordered]@{
        container = $ContainerName
        database = $DbName
        user = $User
    }
    files = [ordered]@{
        dumpPath = $dumpFile
        manifestPath = $manifestFile
        sha256 = $hash
        bytes = $dumpItem.Length
    }
    checks = [ordered]@{
        eastBatonRougeRows = $ebrRows
        minimumEastBatonRougeRows = $MinimumEastBatonRougeRows
    }
    rowCountsByParish = $parishCounts
}

$manifest | ConvertTo-Json -Depth 8 | Set-Content -Path $manifestFile -Encoding UTF8

Write-Host "Backup complete: $dumpFile ($([math]::Round($dumpItem.Length / 1MB, 2)) MB)"
Write-Host "Manifest: $manifestFile"
Write-Host "SHA256: $hash"

Get-ChildItem $BackupDir -Filter "property-db-*.dump" -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } |
    ForEach-Object {
        Write-Host "Removing old backup: $($_.Name)"
        Remove-Item $_.FullName -Force
        $oldManifest = $_.FullName -replace '\.dump$', '.manifest.json'
        if (Test-Path $oldManifest) {
            Remove-Item $oldManifest -Force
        }
    }
