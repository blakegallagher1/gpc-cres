import "dotenv/config";

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const CONTRACT_VERSION = "property-db-contract-v1";
const DEFAULT_OUTPUT_DIR = "output/property-db-backups";
const DEFAULT_REMOTE_DIR = "C:/gpc-cres-backups/property-db";

type CommandResult = {
  command: string;
  output: string;
};

type ParishCount = {
  parish: string | null;
  rowCount: number;
};

type ContractStatus = {
  ok: boolean;
  contractVersion: string;
  rowCountsByParish: ParishCount[];
};

type BackupManifest = {
  generatedAt: string;
  contractVersion: string;
  source: {
    sshHost: string;
    container: string;
    database: string;
    user: string;
  };
  files: {
    localDumpPath: string;
    remoteDumpPath: string;
    localManifestPath: string;
    sha256: string;
    bytes: number;
  };
  rowCountsByParish: ParishCount[];
};

type GatewayConfig = {
  apiKey: string;
  statusUrl: string;
};

function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : fallback;
}

function run(command: string, args: string[]): CommandResult {
  const output = execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { command: [command, ...args].join(" "), output: output.trim() };
}

function runSsh(host: string, args: string[]): CommandResult {
  return run("ssh", [host, ...args]);
}

function sha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function slugTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function firstPresent(values: Array<string | undefined>): string | undefined {
  return values.find((value) => value && value.trim().length > 0);
}

function gatewayConfig(): GatewayConfig {
  const explicitUrl = process.env.PROPERTY_DB_GATEWAY_URL;
  const localApiUrl = process.env.LOCAL_API_URL;
  const proxyUrl = process.env.GATEWAY_PROXY_URL;
  const baseUrl = explicitUrl ?? localApiUrl ?? proxyUrl ?? "http://127.0.0.1:8000";
  const apiKey = explicitUrl
    ? firstPresent([
        process.env.PROPERTY_DB_GATEWAY_TOKEN,
        process.env.LOCAL_API_KEY,
        process.env.GATEWAY_API_KEY,
        process.env.GATEWAY_PROXY_TOKEN,
      ])
    : localApiUrl
      ? firstPresent([
          process.env.LOCAL_API_KEY,
          process.env.GATEWAY_API_KEY,
          process.env.PROPERTY_DB_GATEWAY_TOKEN,
          process.env.GATEWAY_PROXY_TOKEN,
        ])
      : firstPresent([
          process.env.GATEWAY_PROXY_TOKEN,
          process.env.PROPERTY_DB_GATEWAY_TOKEN,
          process.env.LOCAL_API_KEY,
          process.env.GATEWAY_API_KEY,
        ]);

  if (!apiKey) {
    throw new Error("Set LOCAL_API_KEY, GATEWAY_API_KEY, PROPERTY_DB_GATEWAY_TOKEN, or GATEWAY_PROXY_TOKEN.");
  }

  return { apiKey, statusUrl: new URL("/property-db/status", baseUrl).toString() };
}

async function fetchContractStatus(): Promise<ContractStatus> {
  const { apiKey, statusUrl } = gatewayConfig();
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    "x-api-key": apiKey,
    "x-gpc-internal-scope": "parcels.read",
  };
  if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = process.env.CF_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = process.env.CF_ACCESS_CLIENT_SECRET;
  }

  const response = await fetch(statusUrl, { headers });
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(`Contract status failed with HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  const status = body as ContractStatus;
  if (!status.ok || status.contractVersion !== CONTRACT_VERSION) {
    throw new Error(`Contract status is not backup-safe: ${JSON.stringify(status)}`);
  }
  return status;
}

async function main(): Promise<void> {
  const generatedAt = new Date();
  const stamp = slugTimestamp(generatedAt);
  const sshHost = optionalEnv("PROPERTY_DB_SSH_HOST", "bg");
  const container = optionalEnv("PROPERTY_DB_CONTAINER", "entitlement-os-postgres");
  const database = optionalEnv("PROPERTY_DB_NAME", "entitlement_os");
  const user = optionalEnv("PROPERTY_DB_USER", "postgres");
  const outputDir = optionalEnv("PROPERTY_DB_BACKUP_OUTPUT_DIR", DEFAULT_OUTPUT_DIR);
  const remoteDir = optionalEnv("PROPERTY_DB_REMOTE_BACKUP_DIR", DEFAULT_REMOTE_DIR);
  const dumpFileName = `property-db-${stamp}.dump`;
  const manifestFileName = `property-db-${stamp}.manifest.json`;
  const localDumpPath = path.join(outputDir, dumpFileName);
  const localManifestPath = path.join(outputDir, manifestFileName);
  const remoteDumpPath = `${remoteDir}/${dumpFileName}`;
  const remoteManifestPath = `${remoteDir}/${manifestFileName}`;
  const containerDumpPath = `/tmp/${dumpFileName}`;

  mkdirSync(outputDir, { recursive: true });
  const status = await fetchContractStatus();

  runSsh(sshHost, ["powershell", "-NoProfile", "-Command", `New-Item -ItemType Directory -Force -Path ${remoteDir}`]);
  runSsh(sshHost, [
    "docker",
    "exec",
    container,
    "pg_dump",
    "-U",
    user,
    "-d",
    database,
    "-Fc",
    "--no-owner",
    "--no-acl",
    "-f",
    containerDumpPath,
  ]);
  runSsh(sshHost, ["docker", "cp", `${container}:${containerDumpPath}`, remoteDumpPath]);
  runSsh(sshHost, ["docker", "exec", container, "rm", "-f", containerDumpPath]);
  run("scp", [`${sshHost}:${remoteDumpPath}`, localDumpPath]);

  const manifest: BackupManifest = {
    generatedAt: generatedAt.toISOString(),
    contractVersion: status.contractVersion,
    source: { sshHost, container, database, user },
    files: {
      localDumpPath,
      remoteDumpPath,
      localManifestPath,
      sha256: sha256(localDumpPath),
      bytes: statSync(localDumpPath).size,
    },
    rowCountsByParish: status.rowCountsByParish,
  };

  writeFileSync(localManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  run("scp", [localManifestPath, `${sshHost}:${remoteManifestPath}`]);

  console.log(
    `[property-db-backup] ok file=${localDumpPath} bytes=${manifest.files.bytes} sha256=${manifest.files.sha256}`,
  );
}

main().catch((error: unknown) => {
  console.error(`[property-db-backup] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
