import "dotenv/config";

import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";

const DEFAULT_DATABASE = "entitlement_os";
const DEFAULT_GATEWAY_CONTAINER = "fastapi-gateway";
const DEFAULT_PRIMARY_CONTAINER = "entitlement-os-postgres";
const DEFAULT_PRIMARY_HOST = "entitlement-db";
const DEFAULT_REMOTE_ROOT = "C:/gpc-cres-backend";
const DEFAULT_STANDBY_CONTAINER = "property-db-standby";
const DEFAULT_STANDBY_DATA_DIR = "C:/gpc-cres-backend/property_db_standby";
const DEFAULT_USER = "postgres";
const MIN_EBR_ROWS = 150_000;
const PROPERTY_DB_CONTRACT_VERSION = "property-db-contract-v1";

type Action = "refresh" | "smoke" | "status" | "failover";
type Target = "primary" | "standby";

type Options = {
  action: Action;
  target: Target;
  sshHost: string;
  gatewayContainer: string;
  primaryContainer: string;
  primaryHost: string;
  standbyContainer: string;
  standbyDataDir: string;
  database: string;
  user: string;
  remoteRoot: string;
};

type DbChecks = {
  contractVersion: string | null;
  eastBatonRougeRows: number;
  totalRows: number;
};

function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : fallback;
}

function run(command: string, args: string[], env?: NodeJS.ProcessEnv, input?: string): string {
  return execFileSync(command, args, {
    encoding: "utf8",
    env: env ?? process.env,
    input,
    stdio: input ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
  }).trim();
}

function runInherited(command: string, args: string[], env?: NodeJS.ProcessEnv): void {
  execFileSync(command, args, {
    env: env ?? process.env,
    stdio: "inherit",
  });
}

function runSsh(options: Options, args: string[], input?: string): string {
  return run("ssh", [options.sshHost, ...args], undefined, input);
}

function runPowerShell(options: Options, script: string): string {
  const encoded = Buffer.from(`$ProgressPreference = 'SilentlyContinue'; ${script}`, "utf16le").toString("base64");
  return runSsh(options, ["powershell.exe", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded]);
}

function parseOptions(): Options {
  const args = process.argv.slice(2);
  const [actionRaw = "status", targetRaw = "standby"] = args;
  if (!["refresh", "smoke", "status", "failover"].includes(actionRaw)) {
    throw new Error("Usage: property-db:standby <refresh|smoke|status|failover> [primary|standby]");
  }
  if (!["primary", "standby"].includes(targetRaw)) {
    throw new Error("Target must be primary or standby.");
  }

  return {
    action: actionRaw as Action,
    target: targetRaw as Target,
    sshHost: optionalEnv("PROPERTY_DB_SSH_HOST", "bg"),
    gatewayContainer: optionalEnv("PROPERTY_DB_GATEWAY_CONTAINER", DEFAULT_GATEWAY_CONTAINER),
    primaryContainer: optionalEnv("PROPERTY_DB_CONTAINER", DEFAULT_PRIMARY_CONTAINER),
    primaryHost: optionalEnv("PROPERTY_DB_PRIMARY_HOST", DEFAULT_PRIMARY_HOST),
    standbyContainer: optionalEnv("PROPERTY_DB_STANDBY_CONTAINER", DEFAULT_STANDBY_CONTAINER),
    standbyDataDir: optionalEnv("PROPERTY_DB_STANDBY_DATA_DIR", DEFAULT_STANDBY_DATA_DIR),
    database: optionalEnv("PROPERTY_DB_NAME", DEFAULT_DATABASE),
    user: optionalEnv("PROPERTY_DB_USER", DEFAULT_USER),
    remoteRoot: optionalEnv("PROPERTY_DB_REMOTE_ROOT", DEFAULT_REMOTE_ROOT),
  };
}

function inspectContainer(options: Options, container: string, format: string): string | null {
  try {
    return runSsh(options, ["docker", "inspect", "-f", format, container]);
  } catch {
    return null;
  }
}

function containerState(options: Options, container: string): string | null {
  return inspectContainer(options, container, "{{.State.Status}}");
}

function primaryImage(options: Options): string {
  const image = inspectContainer(options, options.primaryContainer, "{{.Config.Image}}");
  if (!image) {
    throw new Error(`Could not inspect primary property DB container: ${options.primaryContainer}`);
  }
  return image;
}

function gatewayNetwork(options: Options): string {
  const network = inspectContainer(options, options.gatewayContainer, "{{.HostConfig.NetworkMode}}");
  if (!network) {
    throw new Error(`Could not inspect gateway container network: ${options.gatewayContainer}`);
  }
  return network;
}

function waitForPostgres(options: Options, container: string): void {
  for (let attempt = 1; attempt <= 90; attempt += 1) {
    try {
      runSsh(options, ["docker", "exec", container, "pg_isready", "-U", options.user, "-d", options.database]);
      return;
    } catch {
      runPowerShell(options, "Start-Sleep -Seconds 1");
    }
  }
  throw new Error(`Postgres did not become ready in ${container}`);
}

function booleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  return !["0", "false", "no"].includes(raw.trim().toLowerCase());
}

function gatewayDatabaseUrl(options: Options): string {
  const script = [
    `$container = docker inspect '${options.gatewayContainer}' | ConvertFrom-Json`,
    `$env = $container.Config.Env | Where-Object { $_ -like 'DATABASE_URL=*' } | Select-Object -First 1`,
    `if (-not $env) { throw 'DATABASE_URL missing from gateway container' }`,
    `$env`,
  ].join("\n");
  return runPowerShell(options, script).replace(/^DATABASE_URL=/, "");
}

function gatewayTargetsStandby(options: Options): boolean {
  return gatewayDatabaseUrl(options).includes(`@${options.standbyContainer}:5432/`);
}

function resetStandby(options: Options): void {
  if (gatewayTargetsStandby(options) && !booleanEnv("PROPERTY_DB_STANDBY_REFRESH_WHILE_ACTIVE", false)) {
    throw new Error("Refusing to reset standby while gateway DATABASE_URL targets standby.");
  }
  if (containerState(options, options.standbyContainer)) {
    runSsh(options, ["docker", "rm", "-f", options.standbyContainer]);
  }
  runPowerShell(options, `Remove-Item -Recurse -Force -Path '${options.standbyDataDir}' -ErrorAction SilentlyContinue`);
}

function ensureStandby(options: Options): void {
  const state = containerState(options, options.standbyContainer);
  if (state === "running") {
    waitForPostgres(options, options.standbyContainer);
    return;
  }
  if (state) {
    runSsh(options, ["docker", "start", options.standbyContainer]);
    waitForPostgres(options, options.standbyContainer);
    return;
  }

  runPowerShell(options, `New-Item -ItemType Directory -Force -Path '${options.standbyDataDir}' | Out-Null`);
  runSsh(options, [
    "docker",
    "run",
    "-d",
    "--name",
    options.standbyContainer,
    "--restart",
    "unless-stopped",
    "--network",
    gatewayNetwork(options),
    "-e",
    `POSTGRES_DB=${options.database}`,
    "-e",
    `POSTGRES_USER=${options.user}`,
    "-e",
    "POSTGRES_PASSWORD=postgres",
    "-v",
    `${options.standbyDataDir}:/var/lib/postgresql/data`,
    primaryImage(options),
  ]);
  waitForPostgres(options, options.standbyContainer);
}

function getNumber(value: unknown, label: string): number {
  if (typeof value !== "number") {
    throw new Error(`Expected ${label} to be a number.`);
  }
  return value;
}

function parseChecks(value: string): DbChecks {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Expected DB smoke query to return a JSON object.");
  }
  const record = parsed as Record<string, unknown>;
  const contractVersion = record.contractVersion;
  if (contractVersion !== null && typeof contractVersion !== "string") {
    throw new Error("Expected contractVersion to be a string or null.");
  }
  return {
    contractVersion,
    eastBatonRougeRows: getNumber(record.eastBatonRougeRows, "eastBatonRougeRows"),
    totalRows: getNumber(record.totalRows, "totalRows"),
  };
}

function queryChecks(options: Options, container: string): DbChecks {
  const query = String.raw`
SELECT json_build_object(
  'contractVersion', (SELECT version FROM property.contract_versions WHERE contract_key = 'property.parcels'),
  'eastBatonRougeRows', (SELECT count(*) FROM property.parcels WHERE parish = 'East Baton Rouge'),
  'totalRows', (SELECT count(*) FROM property.parcels)
)::text;
`;
  const output = run("ssh", [
    options.sshHost,
    "docker",
    "exec",
    "-i",
    container,
    "psql",
    "-U",
    options.user,
    "-d",
    options.database,
    "-v",
    "ON_ERROR_STOP=1",
    "-t",
    "-A",
  ], undefined, query);
  const checks = parseChecks(output);
  if (checks.contractVersion !== PROPERTY_DB_CONTRACT_VERSION) {
    throw new Error(`Contract mismatch on ${container}: ${checks.contractVersion ?? "missing"}`);
  }
  if (checks.eastBatonRougeRows < MIN_EBR_ROWS) {
    throw new Error(`East Baton Rouge row count too low on ${container}: ${checks.eastBatonRougeRows}`);
  }
  return checks;
}

function smokeContainer(options: Options, container: string): DbChecks {
  if (container === options.standbyContainer) {
    ensureStandby(options);
  }
  waitForPostgres(options, container);
  return queryChecks(options, container);
}

function refreshStandby(options: Options): DbChecks {
  resetStandby(options);
  ensureStandby(options);
  runInherited("pnpm", ["exec", "tsx", "scripts/property-db/restore.ts", "--apply"], {
    ...process.env,
    PROPERTY_DB_RESTORE_CONTAINER: options.standbyContainer,
    PROPERTY_DB_RESTORE_NAME: options.database,
    PROPERTY_DB_RESTORE_USER: options.user,
    PROPERTY_DB_RESTORE_FROM_B2: "latest",
    PROPERTY_DB_RESTORE_SKIP_GATEWAY_SMOKE: "true",
    PROPERTY_DB_SSH_HOST: options.sshHost,
    PROPERTY_DB_GATEWAY_CONTAINER: options.gatewayContainer,
  });
  return smokeContainer(options, options.standbyContainer);
}

function psqlHostForTarget(options: Options, target: Target): string {
  return target === "standby" ? options.standbyContainer : options.primaryHost;
}

function containerForTarget(options: Options, target: Target): string {
  return target === "standby" ? options.standbyContainer : options.primaryContainer;
}

function composeOverrideContent(options: Options, target: Target): string {
  const host = psqlHostForTarget(options, target);
  const databaseUrl = `postgresql://${options.user}:postgres@${host}:5432/${options.database}`;
  return [
    "services:",
    "  gateway:",
    "    environment:",
    `      DATABASE_URL: ${databaseUrl}`,
    `      APPLICATION_DATABASE_URL: ${databaseUrl}`,
    "",
  ].join("\n");
}

function writeGatewayOverride(options: Options, target: Target): void {
  const overridePath = `${options.remoteRoot}/docker-compose.property-db-target.override.yml`;
  const content = composeOverrideContent(options, target);
  const script = [
    `$content = @'`,
    content,
    `'@`,
    `Set-Content -Path '${overridePath}' -Value $content -NoNewline -Encoding UTF8`,
    `Set-Location '${options.remoteRoot}'`,
    "docker compose -f docker-compose.yml -f docker-compose.property-db-target.override.yml up -d --no-deps gateway",
  ].join("\n");
  runPowerShell(options, script);
}

function waitForGateway(options: Options): void {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      runSsh(options, ["docker", "exec", options.gatewayContainer, "curl", "-sf", "http://localhost:8000/health"]);
      return;
    } catch {
      runPowerShell(options, "Start-Sleep -Seconds 1");
    }
  }
  throw new Error(`Gateway did not become healthy: ${options.gatewayContainer}`);
}

function runGatewayContractSmoke(): void {
  runInherited("pnpm", ["property-db:contract:smoke"]);
}

function failover(options: Options): DbChecks {
  const checks = smokeContainer(options, containerForTarget(options, options.target));
  writeGatewayOverride(options, options.target);
  waitForGateway(options);
  runGatewayContractSmoke();
  return checks;
}

function main(): void {
  const options = parseOptions();
  if (options.action === "refresh") {
    const checks = refreshStandby(options);
    console.log(
      `[property-db-standby] refreshed container=${options.standbyContainer} ebrRows=${checks.eastBatonRougeRows} totalRows=${checks.totalRows}`,
    );
    return;
  }
  if (options.action === "smoke") {
    const checks = smokeContainer(options, containerForTarget(options, options.target));
    console.log(
      `[property-db-standby] smoke ok target=${options.target} ebrRows=${checks.eastBatonRougeRows} totalRows=${checks.totalRows}`,
    );
    return;
  }
  if (options.action === "failover") {
    const checks = failover(options);
    console.log(
      `[property-db-standby] gateway target=${options.target} ebrRows=${checks.eastBatonRougeRows} totalRows=${checks.totalRows}`,
    );
    return;
  }

  const state = containerState(options, options.standbyContainer) ?? "missing";
  const databaseUrl = gatewayDatabaseUrl(options);
  console.log(`[property-db-standby] status standby=${state} gatewayDatabaseUrl=${databaseUrl}`);
}

try {
  main();
} catch (error: unknown) {
  console.error(`[property-db-standby] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
