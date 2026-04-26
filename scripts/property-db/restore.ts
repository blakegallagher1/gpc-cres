import "dotenv/config";

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const DEFAULT_REMOTE_DIR = "C:/gpc-cres-backups/property-db";
const DEFAULT_OUTPUT_DIR = "output/property-db-backups";
const CONTRACT_SQL_PATH = "infra/sql/property-db-contract-v1.sql";

type RestoreOptions = {
  apply: boolean;
  dumpPath: string;
  sshHost: string;
  container: string;
  database: string;
  user: string;
  remoteDir: string;
  gatewayContainer: string;
};

type BackupManifest = {
  files?: {
    sha256?: string;
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

function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : fallback;
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
s3.download_file(bucket, manifest_key, str(manifest_path))

manifest = json.loads(manifest_path.read_text())
dump_key = manifest.get("offsite", {}).get("dumpKey") or manifest_key.replace(".manifest.json", ".dump")
dump_path = target_dir / Path(dump_key).name
s3.download_file(bucket, dump_key, str(dump_path))

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
  const localDir = path.resolve(params.outputDir, "restore-verify");
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
  const fromB2Latest = args.includes("--from-b2-latest") || process.env.PROPERTY_DB_RESTORE_FROM_B2 === "latest";
  const sshHost = optionalEnv("PROPERTY_DB_SSH_HOST", "bg");
  const remoteDir = optionalEnv("PROPERTY_DB_REMOTE_BACKUP_DIR", DEFAULT_REMOTE_DIR);
  const gatewayContainer = optionalEnv("PROPERTY_DB_GATEWAY_CONTAINER", "fastapi-gateway");
  const outputDir = optionalEnv("PROPERTY_DB_BACKUP_OUTPUT_DIR", DEFAULT_OUTPUT_DIR);
  const dumpPath = fromB2Latest
    ? downloadLatestB2Backup({ sshHost, gatewayContainer, remoteDir, outputDir })
    : args.find((arg) => !arg.startsWith("--")) ?? process.env.PROPERTY_DB_RESTORE_FILE;
  if (!dumpPath) {
    throw new Error("Pass a dump path, set PROPERTY_DB_RESTORE_FILE, or use --from-b2-latest.");
  }
  if (!existsSync(dumpPath)) {
    throw new Error(`Restore dump not found: ${dumpPath}`);
  }
  return {
    apply,
    dumpPath,
    sshHost,
    container: optionalEnv("PROPERTY_DB_RESTORE_CONTAINER", optionalEnv("PROPERTY_DB_CONTAINER", "entitlement-os-postgres")),
    database: optionalEnv("PROPERTY_DB_RESTORE_NAME", optionalEnv("PROPERTY_DB_NAME", "entitlement_os")),
    user: optionalEnv("PROPERTY_DB_RESTORE_USER", optionalEnv("PROPERTY_DB_USER", "postgres")),
    remoteDir,
    gatewayContainer,
  };
}

function verifyManifest(dumpPath: string): void {
  const manifestPath = dumpPath.replace(/\.dump$/, ".manifest.json");
  if (!existsSync(manifestPath)) {
    console.log(`[property-db-restore] no manifest found for ${dumpPath}; sha256 check skipped`);
    return;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as BackupManifest;
  const expectedHash = manifest.files?.sha256;
  if (!expectedHash) {
    throw new Error(`Manifest missing files.sha256: ${manifestPath}`);
  }
  const actualHash = sha256(dumpPath);
  if (actualHash !== expectedHash) {
    throw new Error(`Backup hash mismatch. expected=${expectedHash} actual=${actualHash}`);
  }
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

function applyRestore(options: RestoreOptions, containerDumpPath: string, containerSqlPath: string): void {
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

function main(): void {
  const options = parseOptions();
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
  run("pnpm", ["property-db:contract:smoke"]);
  console.log("[property-db-restore] ok");
}

try {
  main();
} catch (error: unknown) {
  console.error(`[property-db-restore] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
