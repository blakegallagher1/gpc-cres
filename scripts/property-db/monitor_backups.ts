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
  checks?: {
    eastBatonRougeRows?: number;
  };
  rowCountsByParish?: ParishCount[];
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

function eastBatonRougeRows(manifest: BackupManifest): number {
  if (typeof manifest.checks?.eastBatonRougeRows === "number") {
    return manifest.checks.eastBatonRougeRows;
  }
  return manifest.rowCountsByParish?.find((row) => row.parish === "East Baton Rouge")?.rowCount ?? 0;
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
  assertManifestFresh(readRemoteLatestManifest(host, remoteDir));
}

try {
  main();
} catch (error: unknown) {
  console.error(`[property-db-backup-monitor] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
