import "dotenv/config";

import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_BASE_URL = "https://gallagherpropco.com";
const DEFAULT_OUTPUT_DIR = "output/observability/ops-sentinel";
const DEFAULT_SSH_HOST = "bg";
const DEFAULT_GATEWAY_CONTAINER = "fastapi-gateway";
const DEFAULT_TUNNEL_CONTAINER = "cloudflared-tunnel";
const DEFAULT_MARTIN_CONTAINER = "martin-tile-server";
const HTTP_TIMEOUT_MS = 20_000;

type Severity = "info" | "warning" | "error";
type CheckStatus = "pass" | "fail" | "skip";

type CommandResult = {
  ok: boolean;
  output: string;
  durationSeconds: number;
};

type CheckResult = {
  name: string;
  status: CheckStatus;
  durationSeconds: number;
  severity: Severity;
  summary: string;
  details?: string;
};

type RemediationResult = {
  name: string;
  ok: boolean;
  durationSeconds: number;
  summary: string;
  output?: string;
};

type OpsSentinelReport = {
  ok: boolean;
  generatedAt: string;
  durationSeconds: number;
  dryRun: boolean;
  remediate: boolean;
  baseUrl: string;
  checks: CheckResult[];
  remediations: RemediationResult[];
  error: string | null;
};

type RuntimeConfig = {
  baseUrl: string;
  outputDir: string;
  dryRun: boolean;
  remediate: boolean;
  sshHost: string;
  gatewayContainer: string;
  tunnelContainer: string;
  martinContainer: string;
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

function runtimeConfig(): RuntimeConfig {
  const dryRun = booleanEnv("OPS_SENTINEL_DRY_RUN", false);
  return {
    baseUrl: optionalEnv("OPS_SENTINEL_BASE_URL", DEFAULT_BASE_URL).replace(/\/$/, ""),
    outputDir: path.resolve(optionalEnv("OPS_SENTINEL_OUTPUT_DIR", DEFAULT_OUTPUT_DIR)),
    dryRun,
    remediate: booleanEnv("OPS_SENTINEL_REMEDIATE", true) && !dryRun,
    sshHost: optionalEnv("OPS_SENTINEL_SSH_HOST", optionalEnv("PROPERTY_DB_SSH_HOST", DEFAULT_SSH_HOST)),
    gatewayContainer: optionalEnv("OPS_SENTINEL_GATEWAY_CONTAINER", DEFAULT_GATEWAY_CONTAINER),
    tunnelContainer: optionalEnv("OPS_SENTINEL_TUNNEL_CONTAINER", DEFAULT_TUNNEL_CONTAINER),
    martinContainer: optionalEnv("OPS_SENTINEL_MARTIN_CONTAINER", DEFAULT_MARTIN_CONTAINER),
  };
}

function trimOutput(value: string): string {
  return value.trim().slice(0, 4_000);
}

function runCommand(command: string, args: string[], env?: NodeJS.ProcessEnv): CommandResult {
  const startedAt = Date.now();
  try {
    const output = execFileSync(command, args, {
      encoding: "utf8",
      env: env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, output: trimOutput(output), durationSeconds: elapsedSeconds(startedAt) };
  } catch (error: unknown) {
    const commandError = error as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
    const output = [
      commandError.stdout ? String(commandError.stdout).trim() : "",
      commandError.stderr ? String(commandError.stderr).trim() : "",
      commandError.message ?? "command failed",
    ]
      .filter((part) => part.length > 0)
      .join("\n");
    return { ok: false, output: trimOutput(output), durationSeconds: elapsedSeconds(startedAt) };
  }
}

function runPnpm(scriptName: string, env?: NodeJS.ProcessEnv): CommandResult {
  return runCommand("pnpm", [scriptName], env);
}

function runSsh(config: RuntimeConfig, args: string[]): CommandResult {
  return runCommand("ssh", [config.sshHost, ...args]);
}

function elapsedSeconds(startedAt: number): number {
  return Number(((Date.now() - startedAt) / 1000).toFixed(3));
}

function checkFromCommand(name: string, result: CommandResult, severity: Severity): CheckResult {
  return {
    name,
    status: result.ok ? "pass" : "fail",
    durationSeconds: result.durationSeconds,
    severity: result.ok ? "info" : severity,
    summary: result.ok ? "ok" : "failed",
    details: result.output || undefined,
  };
}

async function fetchCheck(config: RuntimeConfig, name: string, endpoint: string): Promise<CheckResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.baseUrl}${endpoint}`, {
      headers: healthHeaders(endpoint),
      signal: controller.signal,
    });
    const text = await response.text();
    const protectedWithoutAuth =
      [401, 403].includes(response.status) &&
      !hasUserHttpAuth() &&
      !booleanEnv("OPS_SENTINEL_REQUIRE_APP_HEALTH_AUTH", false);
    return {
      name,
      status: response.ok ? "pass" : protectedWithoutAuth ? "skip" : "fail",
      durationSeconds: elapsedSeconds(startedAt),
      severity: response.ok ? "info" : protectedWithoutAuth ? "warning" : "error",
      summary: `HTTP ${response.status}`,
      details: trimOutput(text),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      name,
      status: "fail",
      durationSeconds: elapsedSeconds(startedAt),
      severity: "error",
      summary: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function healthHeaders(endpoint: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = process.env.OPS_SENTINEL_HEALTH_TOKEN ?? process.env.HEALTHCHECK_TOKEN ?? process.env.HEALTH_TOKEN;
  const bearer = process.env.OPS_SENTINEL_AUTH_BEARER ?? process.env.OBS_AUTH_BEARER ?? process.env.AUTH_BEARER;
  const cookie = process.env.OPS_SENTINEL_SESSION_COOKIE ?? process.env.OBS_SESSION_COOKIE ?? process.env.SESSION_COOKIE;
  if (bearer) {
    headers.authorization = `Bearer ${bearer}`;
  }
  if (cookie) {
    headers.cookie = cookie;
  }
  if (token && endpoint.includes("health")) {
    headers["x-health-token"] = token;
  }
  return headers;
}

function hasUserHttpAuth(): boolean {
  return Boolean(
    process.env.OPS_SENTINEL_AUTH_BEARER ??
      process.env.OBS_AUTH_BEARER ??
      process.env.AUTH_BEARER ??
      process.env.OPS_SENTINEL_SESSION_COOKIE ??
      process.env.OBS_SESSION_COOKIE ??
      process.env.SESSION_COOKIE,
  );
}

function gatewayHealth(config: RuntimeConfig): CommandResult {
  return runSsh(config, ["docker", "exec", config.gatewayContainer, "curl", "-sf", "http://localhost:8000/health"]);
}

function martinHealth(config: RuntimeConfig): CommandResult {
  return runSsh(config, ["docker", "exec", config.gatewayContainer, "curl", "-sf", "http://martin:3000/catalog"]);
}

function primaryDbSmoke(): CommandResult {
  return runCommand("pnpm", ["exec", "tsx", "scripts/property-db/standby.ts", "smoke", "primary"]);
}

function restartContainer(config: RuntimeConfig, container: string, name: string): RemediationResult {
  const startedAt = Date.now();
  if (!config.remediate) {
    return {
      name,
      ok: true,
      durationSeconds: 0,
      summary: "skipped because remediation is disabled",
    };
  }
  const result = runSsh(config, ["docker", "restart", container]);
  return {
    name,
    ok: result.ok,
    durationSeconds: elapsedSeconds(startedAt),
    summary: result.ok ? `restarted ${container}` : `failed to restart ${container}`,
    output: result.output || undefined,
  };
}

function runRemediation(name: string, command: string, args: string[], config: RuntimeConfig): RemediationResult {
  const startedAt = Date.now();
  if (!config.remediate) {
    return {
      name,
      ok: true,
      durationSeconds: 0,
      summary: "skipped because remediation is disabled",
    };
  }
  const result = runCommand(command, args);
  return {
    name,
    ok: result.ok,
    durationSeconds: elapsedSeconds(startedAt),
    summary: result.ok ? "ok" : "failed",
    output: result.output || undefined,
  };
}

function addCheck(checks: CheckResult[], check: CheckResult): CheckResult {
  checks.push(check);
  return check;
}

function addRemediation(remediations: RemediationResult[], remediation: RemediationResult): RemediationResult {
  remediations.push(remediation);
  return remediation;
}

function shouldRetry(result: CheckResult | CommandResult): boolean {
  return "status" in result ? result.status === "fail" : !result.ok;
}

async function runChecks(config: RuntimeConfig): Promise<Pick<OpsSentinelReport, "checks" | "remediations">> {
  const checks: CheckResult[] = [];
  const remediations: RemediationResult[] = [];

  addCheck(checks, await fetchCheck(config, "vercel-health", "/api/health"));
  addCheck(checks, await fetchCheck(config, "vercel-health-detailed", "/api/health/detailed"));

  let directGateway = addCheck(checks, checkFromCommand("gateway-direct-health", gatewayHealth(config), "error"));
  if (shouldRetry(directGateway)) {
    addRemediation(remediations, restartContainer(config, config.gatewayContainer, "restart-gateway"));
    directGateway = addCheck(checks, checkFromCommand("gateway-direct-health-retry", gatewayHealth(config), "error"));
  }

  let edgeAccess = addCheck(checks, checkFromCommand("gateway-edge-access", runPnpm("smoke:gateway:edge-access"), "error"));
  if (shouldRetry(edgeAccess) && directGateway.status === "pass") {
    addRemediation(remediations, restartContainer(config, config.tunnelContainer, "restart-cloudflare-tunnel"));
    edgeAccess = addCheck(checks, checkFromCommand("gateway-edge-access-retry", runPnpm("smoke:gateway:edge-access"), "error"));
  }

  let martin = addCheck(checks, checkFromCommand("martin-tile-catalog", martinHealth(config), "error"));
  if (shouldRetry(martin)) {
    addRemediation(remediations, restartContainer(config, config.martinContainer, "restart-martin"));
    martin = addCheck(checks, checkFromCommand("martin-tile-catalog-retry", martinHealth(config), "error"));
  }

  const primary = addCheck(checks, checkFromCommand("property-db-primary-smoke", primaryDbSmoke(), "error"));
  const standby = addCheck(checks, checkFromCommand("property-db-standby-smoke", runPnpm("property-db:standby:smoke"), "error"));
  if (primary.status === "fail" && standby.status === "pass") {
    addRemediation(remediations, runRemediation("property-db-failover-standby", "pnpm", ["property-db:failover:standby"], config));
  }

  const contract = addCheck(checks, checkFromCommand("property-db-contract", runPnpm("property-db:contract:smoke"), "error"));
  if (contract.status === "fail" && primary.status === "pass") {
    addRemediation(remediations, restartContainer(config, config.gatewayContainer, "restart-gateway-after-contract-failure"));
    addCheck(checks, checkFromCommand("property-db-contract-retry", runPnpm("property-db:contract:smoke"), "error"));
  }

  let backup = addCheck(checks, checkFromCommand("property-db-backup-monitor", runPnpm("property-db:backup:monitor"), "error"));
  if (shouldRetry(backup) && primary.status === "pass") {
    addRemediation(remediations, runRemediation("property-db-backup-now", "pnpm", ["property-db:backup"], config));
    backup = addCheck(checks, checkFromCommand("property-db-backup-monitor-retry", runPnpm("property-db:backup:monitor"), "error"));
  }

  addCheck(
    checks,
    checkFromCommand("production-map-chat-smoke", productionMonitor(), booleanEnv("OPS_SENTINEL_REQUIRE_PROD_MONITOR", true) ? "error" : "warning"),
  );

  return { checks, remediations };
}

function productionMonitor(): CommandResult {
  return runPnpm("observability:monitor:prod", {
    ...process.env,
    OBS_ALLOW_PARTIAL: process.env.OBS_ALLOW_PARTIAL ?? "true",
    OBS_EMIT_TELEMETRY: process.env.OBS_EMIT_TELEMETRY ?? "false",
  });
}

function writeReport(config: RuntimeConfig, report: OpsSentinelReport): string {
  mkdirSync(config.outputDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  const reportPath = path.join(config.outputDir, `ops-sentinel-${stamp}.json`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(config.outputDir, "latest.json"), `${JSON.stringify(report, null, 2)}\n`);
  return reportPath;
}

function summarizeFailure(report: OpsSentinelReport): string | null {
  const failed = report.checks.filter((check) => check.status === "fail" && check.severity === "error");
  const failedActions = report.remediations.filter((action) => !action.ok);
  if (failed.length === 0 && failedActions.length === 0) {
    return null;
  }
  return [
    ...failed.map((check) => `${check.name}: ${check.summary}`),
    ...failedActions.map((action) => `${action.name}: ${action.summary}`),
  ].join("; ");
}

async function sendSentryEvent(report: OpsSentinelReport): Promise<void> {
  const dsn = process.env.OPS_SENTINEL_SENTRY_DSN ?? process.env.SENTRY_DSN;
  if (!dsn || (report.ok && report.remediations.length === 0)) {
    return;
  }
  const url = new URL(dsn);
  const projectId = url.pathname.split("/").filter(Boolean).pop();
  if (!projectId) {
    throw new Error("Sentry DSN is missing a project id.");
  }
  const endpoint = `${url.protocol}//${url.host}/api/${projectId}/envelope/`;
  const eventId = randomUUID().replace(/-/g, "");
  const envelope = [
    JSON.stringify({ dsn, sent_at: report.generatedAt }),
    JSON.stringify({ type: "event" }),
    JSON.stringify({
      event_id: eventId,
      timestamp: report.generatedAt,
      level: report.ok ? "warning" : "error",
      platform: "node",
      logger: "ops-sentinel",
      message: report.error ?? "Ops sentinel remediation executed",
      tags: {
        component: "ops",
        monitor: "ops-sentinel",
        remediated: String(report.remediations.length > 0),
      },
      extra: report,
    }),
  ].join("\n");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-sentry-envelope" },
    body: `${envelope}\n`,
  });
  if (!response.ok) {
    throw new Error(`Sentry alert failed with HTTP ${response.status}: ${await response.text()}`);
  }
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const config = runtimeConfig();
  const generatedAt = new Date().toISOString();
  const { checks, remediations } = await runChecks(config);
  const baseReport: OpsSentinelReport = {
    ok: false,
    generatedAt,
    durationSeconds: elapsedSeconds(startedAt),
    dryRun: config.dryRun,
    remediate: config.remediate,
    baseUrl: config.baseUrl,
    checks,
    remediations,
    error: null,
  };
  const error = summarizeFailure(baseReport);
  const report = { ...baseReport, ok: error === null, error };
  const reportPath = writeReport(config, report);
  await sendSentryEvent(report);

  if (!report.ok) {
    console.error(`[ops-sentinel] failed report=${reportPath} error=${report.error}`);
    process.exit(1);
  }
  console.log(
    `[ops-sentinel] ok report=${reportPath} checks=${report.checks.length} remediations=${report.remediations.length}`,
  );
}

main().catch((error: unknown) => {
  console.error(`[ops-sentinel] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
