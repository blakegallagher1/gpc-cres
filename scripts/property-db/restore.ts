import "dotenv/config";

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const DEFAULT_REMOTE_DIR = "C:/gpc-cres-backups/property-db";
const DEFAULT_OUTPUT_DIR = "output/property-db-backups";
const DEFAULT_DRILL_EXCLUDED_RELATIONS = "";
const CONTRACT_SQL_PATH = "infra/sql/property-db-contract-v1.sql";

type RestoreOptions = {
  apply: boolean;
  drill: boolean;
  dumpPath: string;
  sshHost: string;
  container: string;
  database: string;
  user: string;
  remoteDir: string;
  gatewayContainer: string;
};

type BackupManifest = {
  generatedAt?: string;
  contractVersion?: string;
  files?: {
    bytes?: number;
    sha256?: string;
  };
  offsite?: {
    dumpKey?: string;
    manifestKey?: string;
  };
};

type B2DownloadResult = {
  ok: boolean;
  dumpKey: string;
  manifestKey: string;
  dumpFileName: string;
  manifestFileName: string;
  dumpBytes: number;
  sha256: string;
};

type DrillStatus = {
  contractVersion: string | null;
  eastBatonRougeRows: number;
  totalRows: number;
};

type RestoreDrillReport = {
  ok: true;
  generatedAt: string;
  durationSeconds: number;
  source: {
    dumpPath: string;
    manifestGeneratedAt: string | null;
    b2DumpKey: string | null;
    b2ManifestKey: string | null;
    sha256: string;
    bytes: number;
  };
  target: {
    sshHost: string;
    container: string;
    image: string;
    database: string;
    user: string;
    excludedRelations: string[];
  };
  checks: DrillStatus;
};

function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : fallback;
}

function booleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  return !["0", "false", "no"].includes(raw.trim().toLowerCase());
}

function run(command: string, args: string[], input?: string): string {
  return execFileSync(command, args, {
    encoding: "utf8",
    input,
    stdio: input ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
  }).trim();
}

function runSsh(host: string, args: string[]): string {
  return run("ssh", [host, ...args]);
}

function sha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function b2Prefix(): string {
  return optionalEnv("PROPERTY_DB_B2_PREFIX", "property-db-backups").replace(/^\/+|\/+$/g, "");
}

function restoreVerifyDir(outputDir: string): string {
  return path.resolve(outputDir, "restore-verify");
}

function isB2CapError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /cap exceeded|Caps & Alerts|download bandwidth|transaction \(Class B\) cap|HeadObject operation: Forbidden/i.test(message);
}

function findCachedVerifiedBackup(outputDir: string): string | null {
  const localDir = restoreVerifyDir(outputDir);
  if (!existsSync(localDir)) {
    return null;
  }

  const candidates = readdirSync(localDir)
    .filter((fileName) => fileName.endsWith(".manifest.json"))
    .map((fileName) => {
      const manifestPath = path.join(localDir, fileName);
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, "")) as BackupManifest;
      const dumpPath = manifestPath.replace(/\.manifest\.json$/, ".dump");
      const generatedAt = manifest.generatedAt ? new Date(manifest.generatedAt).getTime() : statSync(manifestPath).mtimeMs;
      return { dumpPath, generatedAt };
    })
    .filter((candidate) => existsSync(candidate.dumpPath))
    .sort((left, right) => right.generatedAt - left.generatedAt);

  for (const candidate of candidates) {
    try {
      verifyManifest(candidate.dumpPath);
      return candidate.dumpPath;
    } catch (error: unknown) {
      console.error(
        `[property-db-restore] ignoring invalid cached backup ${candidate.dumpPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return null;
}

const b2DownloadLatestScript = String.raw`
import hashlib
import json
import os
import sys
from pathlib import Path

import boto3

prefix, output_dir = sys.argv[1:3]
bucket = os.environ["B2_BUCKET"]

s3 = boto3.client(
    "s3",
    endpoint_url=os.environ["B2_S3_ENDPOINT_URL"],
    aws_access_key_id=os.environ["B2_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["B2_SECRET_ACCESS_KEY"],
    region_name=os.environ.get("B2_REGION") or "us-east-005",
)

manifests = []
paginator = s3.get_paginator("list_objects_v2")
for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
    for item in page.get("Contents", []):
        key = item["Key"]
        if key.endswith(".manifest.json"):
            manifests.append(item)

if not manifests:
    raise RuntimeError(f"No property DB B2 manifests found under prefix={prefix}")

latest = max(manifests, key=lambda item: item["LastModified"])
manifest_key = latest["Key"]
target_dir = Path(output_dir)
target_dir.mkdir(parents=True, exist_ok=True)
manifest_path = target_dir / Path(manifest_key).name

def download_key(key, target_path):
    response = s3.get_object(Bucket=bucket, Key=key)
    with target_path.open("wb") as target_file:
        for chunk in iter(lambda: response["Body"].read(1024 * 1024), b""):
            target_file.write(chunk)

download_key(manifest_key, manifest_path)

manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
dump_key = manifest.get("offsite", {}).get("dumpKey") or manifest_key.replace(".manifest.json", ".dump")
dump_path = target_dir / Path(dump_key).name
download_key(dump_key, dump_path)

hasher = hashlib.sha256()
with dump_path.open("rb") as dump_file:
    for chunk in iter(lambda: dump_file.read(1024 * 1024), b""):
        hasher.update(chunk)
actual_hash = hasher.hexdigest()
expected_hash = manifest.get("files", {}).get("sha256")
if expected_hash and expected_hash != actual_hash:
    raise RuntimeError(f"Downloaded B2 dump hash mismatch: expected={expected_hash} actual={actual_hash}")

print(json.dumps({
    "ok": True,
    "dumpKey": dump_key,
    "manifestKey": manifest_key,
    "dumpFileName": dump_path.name,
    "manifestFileName": manifest_path.name,
    "dumpBytes": dump_path.stat().st_size,
    "sha256": actual_hash,
}))
`;

function downloadLatestB2Backup(params: {
  sshHost: string;
  gatewayContainer: string;
  remoteDir: string;
  outputDir: string;
}): string {
  const stamp = Date.now().toString();
  const containerDir = `/tmp/property-db-restore-${stamp}`;
  const remoteStagingDir = `${params.remoteDir}/restore-verify-${stamp}`;
  const localDir = restoreVerifyDir(params.outputDir);
  mkdirSync(localDir, { recursive: true });
  runSsh(params.sshHost, ["powershell", "-NoProfile", "-Command", `New-Item -ItemType Directory -Force -Path ${remoteStagingDir}`]);
  runSsh(params.sshHost, ["docker", "exec", params.gatewayContainer, "mkdir", "-p", containerDir]);

  try {
    const output = run(
      "ssh",
      [
        params.sshHost,
        "docker",
        "exec",
        "-i",
        params.gatewayContainer,
        "python",
        "-",
        b2Prefix(),
        containerDir,
      ],
      b2DownloadLatestScript,
    );
    const result = JSON.parse(output) as B2DownloadResult;
    if (!result.ok) {
      throw new Error("B2 latest download did not report ok=true.");
    }

    const localDumpPath = path.join(localDir, result.dumpFileName);
    const localManifestPath = path.join(localDir, result.manifestFileName);
    runSsh(params.sshHost, [
      "docker",
      "cp",
      `${params.gatewayContainer}:${containerDir}/${result.dumpFileName}`,
      `${remoteStagingDir}/${result.dumpFileName}`,
    ]);
    runSsh(params.sshHost, [
      "docker",
      "cp",
      `${params.gatewayContainer}:${containerDir}/${result.manifestFileName}`,
      `${remoteStagingDir}/${result.manifestFileName}`,
    ]);
    run("scp", [`${params.sshHost}:${remoteStagingDir}/${result.dumpFileName}`, localDumpPath]);
    run("scp", [`${params.sshHost}:${remoteStagingDir}/${result.manifestFileName}`, localManifestPath]);
    console.log(
      `[property-db-restore] downloaded latest B2 backup dumpKey=${result.dumpKey} manifestKey=${result.manifestKey} bytes=${result.dumpBytes} sha256=${result.sha256}`,
    );
    return localDumpPath;
  } catch (error: unknown) {
    if (booleanEnv("PROPERTY_DB_RESTORE_ALLOW_CACHE_ON_B2_CAP", true) && isB2CapError(error)) {
      const cachedDumpPath = findCachedVerifiedBackup(params.outputDir);
      if (cachedDumpPath) {
        console.log(
          `[property-db-restore] B2 download blocked by account cap; using verified cached backup ${cachedDumpPath}`,
        );
        return cachedDumpPath;
      }
    }
    throw error;
  } finally {
    runSsh(params.sshHost, ["docker", "exec", params.gatewayContainer, "rm", "-rf", containerDir]);
    runSsh(params.sshHost, [
      "powershell",
      "-NoProfile",
      "-Command",
      `Remove-Item -Recurse -Force -Path ${remoteStagingDir} -ErrorAction SilentlyContinue`,
    ]);
  }
}

function parseOptions(): RestoreOptions {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const drill = args.includes("--drill");
  const positionalDumpPath = args.find((arg) => !arg.startsWith("--"));
  const fromB2Latest =
    !positionalDumpPath && (drill || args.includes("--from-b2-latest") || process.env.PROPERTY_DB_RESTORE_FROM_B2 === "latest");
  const sshHost = optionalEnv("PROPERTY_DB_SSH_HOST", "bg");
  const remoteDir = optionalEnv("PROPERTY_DB_REMOTE_BACKUP_DIR", DEFAULT_REMOTE_DIR);
  const gatewayContainer = optionalEnv("PROPERTY_DB_GATEWAY_CONTAINER", "fastapi-gateway");
  const outputDir = optionalEnv("PROPERTY_DB_BACKUP_OUTPUT_DIR", DEFAULT_OUTPUT_DIR);
  const dumpPath = fromB2Latest
    ? downloadLatestB2Backup({ sshHost, gatewayContainer, remoteDir, outputDir })
    : positionalDumpPath ?? process.env.PROPERTY_DB_RESTORE_FILE;
  if (!dumpPath) {
    throw new Error("Pass a dump path, set PROPERTY_DB_RESTORE_FILE, or use --from-b2-latest.");
  }
  if (!existsSync(dumpPath)) {
    throw new Error(`Restore dump not found: ${dumpPath}`);
  }
  return {
    apply,
    drill,
    dumpPath,
    sshHost,
    container: optionalEnv("PROPERTY_DB_RESTORE_CONTAINER", optionalEnv("PROPERTY_DB_CONTAINER", "entitlement-os-postgres")),
    database: optionalEnv("PROPERTY_DB_RESTORE_NAME", optionalEnv("PROPERTY_DB_NAME", "entitlement_os")),
    user: optionalEnv("PROPERTY_DB_RESTORE_USER", optionalEnv("PROPERTY_DB_USER", "postgres")),
    remoteDir,
    gatewayContainer,
  };
}

function readManifest(dumpPath: string): BackupManifest | null {
  const manifestPath = dumpPath.replace(/\.dump$/, ".manifest.json");
  if (!existsSync(manifestPath)) {
    return null;
  }
  return JSON.parse(readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, "")) as BackupManifest;
}

function verifyManifest(dumpPath: string): BackupManifest | null {
  const manifest = readManifest(dumpPath);
  if (!manifest) {
    console.log(`[property-db-restore] no manifest found for ${dumpPath}; sha256 check skipped`);
    return null;
  }
  const expectedHash = manifest.files?.sha256;
  if (!expectedHash) {
    throw new Error(`Manifest missing files.sha256 for ${dumpPath}`);
  }
  const actualHash = sha256(dumpPath);
  if (actualHash !== expectedHash) {
    throw new Error(`Backup hash mismatch. expected=${expectedHash} actual=${actualHash}`);
  }
  return manifest;
}

function printPlan(options: RestoreOptions): void {
  console.log("[property-db-restore] plan");
  console.log(`  dump=${options.dumpPath}`);
  console.log(`  sshHost=${options.sshHost}`);
  console.log(`  container=${options.container}`);
  console.log(`  database=${options.database}`);
  console.log(`  user=${options.user}`);
  console.log(`  apply=${options.apply}`);
}

function copyInputs(options: RestoreOptions): { containerDumpPath: string; containerSqlPath: string } {
  const dumpName = path.basename(options.dumpPath);
  const sqlName = path.basename(CONTRACT_SQL_PATH);
  const remoteDumpPath = `${options.remoteDir}/${dumpName}`;
  const remoteSqlPath = `${options.remoteDir}/${sqlName}`;
  const containerDumpPath = `/tmp/${dumpName}`;
  const containerSqlPath = `/tmp/${sqlName}`;

  runSsh(options.sshHost, [
    "powershell",
    "-NoProfile",
    "-Command",
    `New-Item -ItemType Directory -Force -Path ${options.remoteDir}`,
  ]);
  run("scp", [options.dumpPath, `${options.sshHost}:${remoteDumpPath}`]);
  run("scp", [CONTRACT_SQL_PATH, `${options.sshHost}:${remoteSqlPath}`]);
  runSsh(options.sshHost, ["docker", "cp", remoteDumpPath, `${options.container}:${containerDumpPath}`]);
  runSsh(options.sshHost, ["docker", "cp", remoteSqlPath, `${options.container}:${containerSqlPath}`]);

  return { containerDumpPath, containerSqlPath };
}

function drillExcludedRelations(): string[] {
  const raw = process.env.PROPERTY_DB_RESTORE_DRILL_EXCLUDE_RELATIONS ?? DEFAULT_DRILL_EXCLUDED_RELATIONS;
  return raw
    .split(",")
    .map((relation) => relation.trim())
    .filter((relation) => relation.length > 0);
}

function shQuote(value: string): string {
  return `'${value.replace(/'/g, "'\"'\"'")}'`;
}

function escapeExtendedRegex(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function buildFilteredRestoreList(
  options: RestoreOptions,
  containerDumpPath: string,
  excludedRelations: string[],
): string | null {
  if (excludedRelations.length === 0) {
    return null;
  }
  const containerListPath = `${containerDumpPath}.restore-list`;
  const exclusionTerms = excludedRelations.flatMap((relation) => {
    const bareRelation = relation.split(".").pop();
    return bareRelation ? [relation, bareRelation] : [relation];
  });
  const exclusionPattern = exclusionTerms.map(escapeExtendedRegex).join("|");
  run(
    "ssh",
    [options.sshHost, "docker", "exec", "-i", options.container, "sh"],
    `pg_restore -l ${shQuote(containerDumpPath)} | grep -v -E ${shQuote(exclusionPattern)} > ${shQuote(containerListPath)}\n`,
  );
  return containerListPath;
}

function applyRestore(
  options: RestoreOptions,
  containerDumpPath: string,
  containerSqlPath: string,
  containerRestoreListPath?: string | null,
): void {
  runSsh(options.sshHost, [
    "docker",
    "exec",
    options.container,
    "pg_restore",
    "-U",
    options.user,
    "-d",
    options.database,
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-acl",
    ...(containerRestoreListPath ? ["-L", containerRestoreListPath] : []),
    containerDumpPath,
  ]);
  runSsh(options.sshHost, [
    "docker",
    "exec",
    options.container,
    "psql",
    "-U",
    options.user,
    "-d",
    options.database,
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
    containerSqlPath,
  ]);
}

function cleanup(options: RestoreOptions, containerDumpPath: string, containerSqlPath: string): void {
  runSsh(options.sshHost, [
    "docker",
    "exec",
    options.container,
    "rm",
    "-f",
    containerDumpPath,
    containerSqlPath,
  ]);
}

function restoreDrillImage(options: RestoreOptions): string {
  const explicit = process.env.PROPERTY_DB_RESTORE_DRILL_IMAGE;
  if (explicit && explicit.trim().length > 0) {
    return explicit;
  }
  return runSsh(options.sshHost, [
    "docker",
    "inspect",
    optionalEnv("PROPERTY_DB_CONTAINER", "entitlement-os-postgres"),
    "--format",
    "{{.Config.Image}}",
  ]);
}

function waitForPostgres(options: RestoreOptions): void {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      runSsh(options.sshHost, [
        "docker",
        "exec",
        options.container,
        "pg_isready",
        "-U",
        options.user,
        "-d",
        options.database,
      ]);
      return;
    } catch {
      runSsh(options.sshHost, ["powershell", "-NoProfile", "-Command", "Start-Sleep -Seconds 1"]);
    }
  }
  throw new Error(`Restore drill Postgres did not become ready: container=${options.container}`);
}

function startRestoreDrillContainer(options: RestoreOptions, image: string): void {
  runSsh(options.sshHost, [
    "docker",
    "run",
    "-d",
    "--rm",
    "--name",
    options.container,
    "-e",
    `POSTGRES_DB=${options.database}`,
    "-e",
    `POSTGRES_USER=${options.user}`,
    "-e",
    "POSTGRES_PASSWORD=postgres",
    image,
  ]);
  waitForPostgres(options);
}

function stopRestoreDrillContainer(options: RestoreOptions): void {
  runSsh(options.sshHost, ["docker", "rm", "-f", options.container]);
}

function tryStopRestoreDrillContainer(options: RestoreOptions): void {
  try {
    stopRestoreDrillContainer(options);
  } catch (error: unknown) {
    console.error(
      `[property-db-restore-drill] failed to remove disposable container ${options.container}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function queryDrillStatus(options: RestoreOptions): DrillStatus {
  const query = String.raw`
SELECT json_build_object(
  'contractVersion', (SELECT version FROM property.contract_versions WHERE contract_key = 'property.parcels'),
  'eastBatonRougeRows', (SELECT count(*) FROM property.parcels WHERE parish = 'East Baton Rouge'),
  'totalRows', (SELECT count(*) FROM property.parcels)
)::text;
`;
  const output = run(
    "ssh",
    [
      options.sshHost,
      "docker",
      "exec",
      "-i",
      options.container,
      "psql",
      "-U",
      options.user,
      "-d",
      options.database,
      "-v",
      "ON_ERROR_STOP=1",
      "-t",
      "-A",
    ],
    query,
  );
  const parsed = JSON.parse(output) as DrillStatus;
  if (parsed.contractVersion !== "property-db-contract-v1") {
    throw new Error(`Restore drill contract mismatch: ${parsed.contractVersion ?? "missing"}`);
  }
  if (parsed.eastBatonRougeRows < 150_000) {
    throw new Error(`Restore drill East Baton Rouge rows too low: ${parsed.eastBatonRougeRows}`);
  }
  return parsed;
}

function writeDrillReport(report: RestoreDrillReport): string {
  const reportDir = path.resolve(DEFAULT_OUTPUT_DIR, "restore-drill");
  mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `restore-drill-${report.generatedAt.replace(/[:.]/g, "-")}.json`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return reportPath;
}

function runRestoreDrill(options: RestoreOptions, manifest: BackupManifest | null): void {
  const startedAt = Date.now();
  const image = restoreDrillImage(options);
  const excludedRelations = drillExcludedRelations();
  if (excludedRelations.length > 0) {
    console.log(`[property-db-restore-drill] excluding non-contract relations: ${excludedRelations.join(",")}`);
  }
  let inputs: { containerDumpPath: string; containerSqlPath: string } | null = null;
  let containerStarted = false;
  try {
    startRestoreDrillContainer(options, image);
    containerStarted = true;
    inputs = copyInputs(options);
    const restoreListPath = buildFilteredRestoreList(options, inputs.containerDumpPath, excludedRelations);
    applyRestore(options, inputs.containerDumpPath, inputs.containerSqlPath, restoreListPath);
    const checks = queryDrillStatus(options);
    const report: RestoreDrillReport = {
      ok: true,
      generatedAt: new Date().toISOString(),
      durationSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(3)),
      source: {
        dumpPath: options.dumpPath,
        manifestGeneratedAt: manifest?.generatedAt ?? null,
        b2DumpKey: manifest?.offsite?.dumpKey ?? null,
        b2ManifestKey: manifest?.offsite?.manifestKey ?? null,
        sha256: manifest?.files?.sha256 ?? sha256(options.dumpPath),
        bytes: manifest?.files?.bytes ?? readFileSync(options.dumpPath).byteLength,
      },
      target: {
        sshHost: options.sshHost,
        container: options.container,
        image,
        database: options.database,
        user: options.user,
        excludedRelations,
      },
      checks,
    };
    const reportPath = writeDrillReport(report);
    console.log(
      `[property-db-restore-drill] ok report=${reportPath} durationSeconds=${report.durationSeconds} ebrRows=${checks.eastBatonRougeRows} totalRows=${checks.totalRows}`,
    );
  } finally {
    if (inputs) {
      cleanup(options, inputs.containerDumpPath, inputs.containerSqlPath);
    }
    if (containerStarted && process.env.PROPERTY_DB_RESTORE_DRILL_KEEP_CONTAINER !== "true") {
      tryStopRestoreDrillContainer(options);
    }
  }
}

function main(): void {
  const options = parseOptions();
  if (options.drill) {
    const drillContainer = `${optionalEnv("PROPERTY_DB_RESTORE_DRILL_CONTAINER", "property-db-restore-drill")}-${Date.now()}`;
    const drillOptions: RestoreOptions = {
      ...options,
      apply: true,
      container: drillContainer,
      database: optionalEnv("PROPERTY_DB_RESTORE_DRILL_DATABASE", "property_restore_drill"),
      user: optionalEnv("PROPERTY_DB_RESTORE_DRILL_USER", "postgres"),
    };
    const manifest = verifyManifest(drillOptions.dumpPath);
    runRestoreDrill(drillOptions, manifest);
    return;
  }

  printPlan(options);
  verifyManifest(options.dumpPath);
  if (!options.apply) {
    console.log("[property-db-restore] dry run only; rerun with --apply to restore.");
    return;
  }

  const { containerDumpPath, containerSqlPath } = copyInputs(options);
  try {
    applyRestore(options, containerDumpPath, containerSqlPath);
  } finally {
    cleanup(options, containerDumpPath, containerSqlPath);
  }
  if (!booleanEnv("PROPERTY_DB_RESTORE_SKIP_GATEWAY_SMOKE", false)) {
    run("pnpm", ["property-db:contract:smoke"]);
  }
  console.log("[property-db-restore] ok");
}

try {
  main();
} catch (error: unknown) {
  console.error(`[property-db-restore] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
