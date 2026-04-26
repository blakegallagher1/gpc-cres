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
    [string]$GatewayContainerName = "fastapi-gateway",
    [string]$DbName = "entitlement_os",
    [string]$User = "postgres",
    [string]$ContractVersion = "property-db-contract-v1",
    [int]$MinimumEastBatonRougeRows = 150000,
    [string]$B2Prefix = "property-db-backups",
    [switch]$SkipB2Upload
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

function Format-B2Prefix {
    param([string]$Prefix)

    return $Prefix.Trim("/")
}

function Join-B2Key {
    param(
        [string]$Prefix,
        [string]$FileName
    )

    $normalizedPrefix = Format-B2Prefix $Prefix
    if ($normalizedPrefix -eq "") {
        return $FileName
    }
    return "$normalizedPrefix/$FileName"
}

function Upload-BackupToB2 {
    param(
        [string]$DumpFile,
        [string]$ManifestFile,
        [string]$DumpKey,
        [string]$ManifestKey
    )

    $containerDumpPath = "/tmp/$(Split-Path -Leaf $DumpFile)"
    $containerManifestPath = "/tmp/$(Split-Path -Leaf $ManifestFile)"
    $python = @'
import json
import os
import sys
from urllib.parse import urlparse

import boto3

dump_path, manifest_path, dump_key, manifest_key = sys.argv[1:5]
endpoint_url = os.environ["B2_S3_ENDPOINT_URL"]
bucket = os.environ["B2_BUCKET"]

s3 = boto3.client(
    "s3",
    endpoint_url=endpoint_url,
    aws_access_key_id=os.environ["B2_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["B2_SECRET_ACCESS_KEY"],
    region_name=os.environ.get("B2_REGION") or "us-east-005",
)

def upload_and_check(local_path, key):
    s3.upload_file(local_path, bucket, key)
    head = s3.head_object(Bucket=bucket, Key=key)
    local_size = os.path.getsize(local_path)
    remote_size = int(head["ContentLength"])
    if remote_size != local_size:
        raise RuntimeError(f"size mismatch for {key}: local={local_size} remote={remote_size}")
    return remote_size

dump_bytes = upload_and_check(dump_path, dump_key)
manifest_bytes = upload_and_check(manifest_path, manifest_key)
bucket_masked = bucket[:3] + "..." + bucket[-3:] if len(bucket) > 6 else "***"

print(json.dumps({
    "ok": True,
    "bucketMasked": bucket_masked,
    "endpointHost": urlparse(endpoint_url).netloc,
    "dumpKey": dump_key,
    "manifestKey": manifest_key,
    "dumpBytes": dump_bytes,
    "manifestBytes": manifest_bytes,
}))
'@

    docker cp $DumpFile "${GatewayContainerName}:$containerDumpPath"
    if ($LASTEXITCODE -ne 0) { throw "docker cp dump to $GatewayContainerName failed with exit code $LASTEXITCODE" }
    docker cp $ManifestFile "${GatewayContainerName}:$containerManifestPath"
    if ($LASTEXITCODE -ne 0) { throw "docker cp manifest to $GatewayContainerName failed with exit code $LASTEXITCODE" }

    try {
        $uploadResult = $python | docker exec -i $GatewayContainerName python - $containerDumpPath $containerManifestPath $DumpKey $ManifestKey
        if ($LASTEXITCODE -ne 0) {
            throw "B2 upload failed with exit code $LASTEXITCODE"
        }
        return ($uploadResult | Select-Object -Last 1)
    } finally {
        docker exec $GatewayContainerName rm -f $containerDumpPath $containerManifestPath 2>$null | Out-Null
    }
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
$normalizedB2Prefix = Format-B2Prefix $B2Prefix
$dumpKey = Join-B2Key $normalizedB2Prefix $dumpName
$manifestKey = Join-B2Key $normalizedB2Prefix $manifestName

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
    offsite = [ordered]@{
        provider = "backblaze-b2"
        prefix = $normalizedB2Prefix
        dumpKey = $dumpKey
        manifestKey = $manifestKey
        uploadedAt = (Get-Date).ToUniversalTime().ToString("o")
        verified = -not $SkipB2Upload
    }
    checks = [ordered]@{
        eastBatonRougeRows = $ebrRows
        minimumEastBatonRougeRows = $MinimumEastBatonRougeRows
    }
    rowCountsByParish = $parishCounts
}

$manifest | ConvertTo-Json -Depth 8 | Set-Content -Path $manifestFile -Encoding UTF8

if (-not $SkipB2Upload) {
    Write-Host "Uploading backup to B2: $dumpKey"
    $b2Upload = Upload-BackupToB2 -DumpFile $dumpFile -ManifestFile $manifestFile -DumpKey $dumpKey -ManifestKey $manifestKey
    Write-Host "B2 upload verified: $b2Upload"
}

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
