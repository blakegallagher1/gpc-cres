import "dotenv/config";

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const DEFAULT_REMOTE_DIR = "C:/gpc-cres-backups/property-db";
const CONTRACT_SQL_PATH = "infra/sql/property-db-contract-v1.sql";

type RestoreOptions = {
  apply: boolean;
  dumpPath: string;
  sshHost: string;
  container: string;
  database: string;
  user: string;
  remoteDir: string;
};

type BackupManifest = {
  files?: {
    sha256?: string;
  };
};

function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : fallback;
}

function run(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function runSsh(host: string, args: string[]): string {
  return run("ssh", [host, ...args]);
}

function sha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function parseOptions(): RestoreOptions {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const dumpPath = args.find((arg) => !arg.startsWith("--")) ?? process.env.PROPERTY_DB_RESTORE_FILE;
  if (!dumpPath) {
    throw new Error("Pass a dump path or set PROPERTY_DB_RESTORE_FILE.");
  }
  if (!existsSync(dumpPath)) {
    throw new Error(`Restore dump not found: ${dumpPath}`);
  }
  return {
    apply,
    dumpPath,
    sshHost: optionalEnv("PROPERTY_DB_SSH_HOST", "bg"),
    container: optionalEnv("PROPERTY_DB_RESTORE_CONTAINER", optionalEnv("PROPERTY_DB_CONTAINER", "entitlement-os-postgres")),
    database: optionalEnv("PROPERTY_DB_RESTORE_NAME", optionalEnv("PROPERTY_DB_NAME", "entitlement_os")),
    user: optionalEnv("PROPERTY_DB_RESTORE_USER", optionalEnv("PROPERTY_DB_USER", "postgres")),
    remoteDir: optionalEnv("PROPERTY_DB_REMOTE_BACKUP_DIR", DEFAULT_REMOTE_DIR),
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
