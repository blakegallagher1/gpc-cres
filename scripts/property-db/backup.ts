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
  offsite: {
    provider: "backblaze-b2";
    prefix: string;
    dumpKey: string;
    manifestKey: string;
    uploadedAt: string;
    verified: boolean;
  };
  rowCountsByParish: ParishCount[];
};

type GatewayConfig = {
  apiKey: string;
  statusUrl: string;
};

type B2UploadResult = {
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

function run(command: string, args: string[], input?: string): CommandResult {
  const output = execFileSync(command, args, {
    encoding: "utf8",
    input,
    stdio: input ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
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

function b2ObjectKey(prefix: string, fileName: string): string {
  const normalizedPrefix = prefix.replace(/^\/+|\/+$/g, "");
  return normalizedPrefix ? `${normalizedPrefix}/${fileName}` : fileName;
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

const b2UploadScript = String.raw`
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
`;

function uploadBackupToB2(params: {
  sshHost: string;
  gatewayContainer: string;
  remoteDumpPath: string;
  remoteManifestPath: string;
  dumpKey: string;
  manifestKey: string;
}): B2UploadResult {
  const containerDumpPath = `/tmp/${path.basename(params.remoteDumpPath)}`;
  const containerManifestPath = `/tmp/${path.basename(params.remoteManifestPath)}`;

  runSsh(params.sshHost, [
    "docker",
    "cp",
    params.remoteDumpPath,
    `${params.gatewayContainer}:${containerDumpPath}`,
  ]);
  runSsh(params.sshHost, [
    "docker",
    "cp",
    params.remoteManifestPath,
    `${params.gatewayContainer}:${containerManifestPath}`,
  ]);

  try {
    const result = run(
      "ssh",
      [
        params.sshHost,
        "docker",
        "exec",
        "-i",
        params.gatewayContainer,
        "python",
        "-",
        containerDumpPath,
        containerManifestPath,
        params.dumpKey,
        params.manifestKey,
      ],
      b2UploadScript,
    );
    const parsed = JSON.parse(result.output) as B2UploadResult;
    if (!parsed.ok) {
      throw new Error("B2 upload did not report ok=true");
    }
    return parsed;
  } finally {
    runSsh(params.sshHost, [
      "docker",
      "exec",
      params.gatewayContainer,
      "rm",
      "-f",
      containerDumpPath,
      containerManifestPath,
    ]);
  }
}

async function main(): Promise<void> {
  const generatedAt = new Date();
  const stamp = slugTimestamp(generatedAt);
  const sshHost = optionalEnv("PROPERTY_DB_SSH_HOST", "bg");
  const container = optionalEnv("PROPERTY_DB_CONTAINER", "entitlement-os-postgres");
  const gatewayContainer = optionalEnv("PROPERTY_DB_GATEWAY_CONTAINER", "fastapi-gateway");
  const database = optionalEnv("PROPERTY_DB_NAME", "entitlement_os");
  const user = optionalEnv("PROPERTY_DB_USER", "postgres");
  const outputDir = optionalEnv("PROPERTY_DB_BACKUP_OUTPUT_DIR", DEFAULT_OUTPUT_DIR);
  const remoteDir = optionalEnv("PROPERTY_DB_REMOTE_BACKUP_DIR", DEFAULT_REMOTE_DIR);
  const b2Prefix = optionalEnv("PROPERTY_DB_B2_PREFIX", "property-db-backups");
  const dumpFileName = `property-db-${stamp}.dump`;
  const manifestFileName = `property-db-${stamp}.manifest.json`;
  const localDumpPath = path.join(outputDir, dumpFileName);
  const localManifestPath = path.join(outputDir, manifestFileName);
  const remoteDumpPath = `${remoteDir}/${dumpFileName}`;
  const remoteManifestPath = `${remoteDir}/${manifestFileName}`;
  const containerDumpPath = `/tmp/${dumpFileName}`;
  const dumpKey = b2ObjectKey(b2Prefix, dumpFileName);
  const manifestKey = b2ObjectKey(b2Prefix, manifestFileName);

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
    offsite: {
      provider: "backblaze-b2",
      prefix: b2Prefix.replace(/^\/+|\/+$/g, ""),
      dumpKey,
      manifestKey,
      uploadedAt: new Date().toISOString(),
      verified: true,
    },
    rowCountsByParish: status.rowCountsByParish,
  };

  writeFileSync(localManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  run("scp", [localManifestPath, `${sshHost}:${remoteManifestPath}`]);
  const b2Upload = uploadBackupToB2({
    sshHost,
    gatewayContainer,
    remoteDumpPath,
    remoteManifestPath,
    dumpKey,
    manifestKey,
  });

  console.log(
    `[property-db-backup] ok file=${localDumpPath} bytes=${manifest.files.bytes} sha256=${manifest.files.sha256} b2=${b2Upload.dumpKey} bucket=${b2Upload.bucketMasked} endpoint=${b2Upload.endpointHost}`,
  );
}

main().catch((error: unknown) => {
  console.error(`[property-db-backup] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
