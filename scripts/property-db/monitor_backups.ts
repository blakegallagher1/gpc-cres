import "dotenv/config";

import { execFileSync } from "node:child_process";

const CONTRACT_VERSION = "property-db-contract-v1";
const DEFAULT_REMOTE_DIR = "C:/gpc-cres-backups/property-db";
const DEFAULT_MAX_AGE_HOURS = 30;
const DEFAULT_MIN_BYTES = 100_000_000;
const DEFAULT_MIN_EBR_ROWS = 150_000;

type ParishCount = {
  parish: string | null;
  rowCount: number;
};

type BackupManifest = {
  generatedAt?: string;
  contractVersion?: string;
  files?: {
    bytes?: number;
    sha256?: string;
  };
  offsite?: {
    provider?: string;
    dumpKey?: string;
    manifestKey?: string;
    verified?: boolean;
  };
  checks?: {
    eastBatonRougeRows?: number;
  };
  rowCountsByParish?: ParishCount[];
};

type B2HeadResult = {
  ok: boolean;
  bucketMasked: string;
  endpointHost: string;
  dumpKey: string;
  manifestKey: string;
  dumpBytes: number;
  manifestBytes: number;
};

function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : fallback;
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number.`);
  }
  return parsed;
}

function powershellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function encodedPowerShell(command: string): string {
  return Buffer.from(command, "utf16le").toString("base64");
}

function booleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  return !["0", "false", "no"].includes(raw.trim().toLowerCase());
}

function readRemoteLatestManifest(host: string, remoteDir: string): BackupManifest {
  const command = `
$ErrorActionPreference = "Stop"
$manifest = Get-ChildItem -Path ${powershellString(remoteDir)} -Filter "property-db-*.manifest.json" -ErrorAction Stop |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if ($null -eq $manifest) {
  throw "No property DB backup manifests found in ${remoteDir}"
}
Get-Content -Raw -Path $manifest.FullName
`;
  const output = execFileSync("ssh", [
    host,
    "powershell",
    "-NoProfile",
    "-EncodedCommand",
    encodedPowerShell(command),
  ], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(output) as BackupManifest;
}

const b2HeadScript = String.raw`
import json
import os
import sys
from urllib.parse import urlparse

import boto3

dump_key, manifest_key = sys.argv[1:3]
endpoint_url = os.environ["B2_S3_ENDPOINT_URL"]
bucket = os.environ["B2_BUCKET"]

s3 = boto3.client(
    "s3",
    endpoint_url=endpoint_url,
    aws_access_key_id=os.environ["B2_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["B2_SECRET_ACCESS_KEY"],
    region_name=os.environ.get("B2_REGION") or "us-east-005",
)

def content_length(key):
    head = s3.head_object(Bucket=bucket, Key=key)
    return int(head["ContentLength"])

bucket_masked = bucket[:3] + "..." + bucket[-3:] if len(bucket) > 6 else "***"

print(json.dumps({
    "ok": True,
    "bucketMasked": bucket_masked,
    "endpointHost": urlparse(endpoint_url).netloc,
    "dumpKey": dump_key,
    "manifestKey": manifest_key,
    "dumpBytes": content_length(dump_key),
    "manifestBytes": content_length(manifest_key),
}))
`;

function eastBatonRougeRows(manifest: BackupManifest): number {
  if (typeof manifest.checks?.eastBatonRougeRows === "number") {
    return manifest.checks.eastBatonRougeRows;
  }
  return manifest.rowCountsByParish?.find((row) => row.parish === "East Baton Rouge")?.rowCount ?? 0;
}

function assertOffsiteBackup(host: string, manifest: BackupManifest): void {
  const offsite = manifest.offsite;
  if (offsite?.provider !== "backblaze-b2") {
    throw new Error("Latest backup manifest is missing offsite.provider=backblaze-b2.");
  }
  if (!offsite.dumpKey || !offsite.manifestKey) {
    throw new Error("Latest backup manifest is missing B2 dumpKey or manifestKey.");
  }
  if (offsite.verified !== true) {
    throw new Error("Latest backup manifest does not mark the B2 upload as verified.");
  }

  const gatewayContainer = optionalEnv("PROPERTY_DB_GATEWAY_CONTAINER", "fastapi-gateway");
  const output = execFileSync("ssh", [
    host,
    "docker",
    "exec",
    "-i",
    gatewayContainer,
    "python",
    "-",
    offsite.dumpKey,
    offsite.manifestKey,
  ], {
    encoding: "utf8",
    input: b2HeadScript,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const result = JSON.parse(output) as B2HeadResult;
  if (!result.ok) {
    throw new Error("B2 object check did not report ok=true.");
  }
  if (result.dumpBytes !== manifest.files?.bytes) {
    throw new Error(`B2 dump size mismatch: b2=${result.dumpBytes} manifest=${manifest.files?.bytes ?? "missing"}.`);
  }
  if (result.manifestBytes <= 0) {
    throw new Error(`B2 manifest object is empty: key=${result.manifestKey}.`);
  }

  console.log(
    `[property-db-backup-monitor] b2 ok bucket=${result.bucketMasked} endpoint=${result.endpointHost} dumpKey=${result.dumpKey} bytes=${result.dumpBytes}`,
  );
}

function assertManifestFresh(manifest: BackupManifest): void {
  const maxAgeHours = numberEnv("PROPERTY_DB_BACKUP_MAX_AGE_HOURS", DEFAULT_MAX_AGE_HOURS);
  const minBytes = numberEnv("PROPERTY_DB_BACKUP_MIN_BYTES", DEFAULT_MIN_BYTES);
  const minEbrRows = numberEnv("PROPERTY_DB_MIN_EBR_ROWS", DEFAULT_MIN_EBR_ROWS);
  const generatedAt = manifest.generatedAt ? new Date(manifest.generatedAt) : null;
  if (!generatedAt || Number.isNaN(generatedAt.getTime())) {
    throw new Error("Latest backup manifest is missing a valid generatedAt timestamp.");
  }

  const ageHours = (Date.now() - generatedAt.getTime()) / (60 * 60 * 1000);
  if (ageHours > maxAgeHours) {
    throw new Error(`Latest property DB backup is stale: ageHours=${ageHours.toFixed(2)} max=${maxAgeHours}.`);
  }
  if (manifest.contractVersion !== CONTRACT_VERSION) {
    throw new Error(`Expected ${CONTRACT_VERSION}, got ${manifest.contractVersion ?? "missing"}.`);
  }
  if (!manifest.files?.sha256) {
    throw new Error("Latest backup manifest is missing files.sha256.");
  }
  if ((manifest.files.bytes ?? 0) < minBytes) {
    throw new Error(`Latest backup is too small: bytes=${manifest.files.bytes ?? 0} min=${minBytes}.`);
  }

  const ebrRows = eastBatonRougeRows(manifest);
  if (ebrRows < minEbrRows) {
    throw new Error(`East Baton Rouge row count too low in latest backup: rows=${ebrRows} min=${minEbrRows}.`);
  }

  console.log(
    `[property-db-backup-monitor] ok generatedAt=${generatedAt.toISOString()} ageHours=${ageHours.toFixed(2)} bytes=${manifest.files.bytes} ebrRows=${ebrRows}`,
  );
}

function main(): void {
  const host = optionalEnv("PROPERTY_DB_SSH_HOST", "bg");
  const remoteDir = optionalEnv("PROPERTY_DB_REMOTE_BACKUP_DIR", DEFAULT_REMOTE_DIR);
  const manifest = readRemoteLatestManifest(host, remoteDir);
  assertManifestFresh(manifest);
  if (booleanEnv("PROPERTY_DB_BACKUP_REQUIRE_B2", true)) {
    assertOffsiteBackup(host, manifest);
  }
}

try {
  main();
} catch (error: unknown) {
  console.error(`[property-db-backup-monitor] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
