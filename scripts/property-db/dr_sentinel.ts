import "dotenv/config";

import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_OUTPUT_DIR = "output/property-db-backups";
const DEFAULT_DRILL_INTERVAL_DAYS = 7;

type CommandRun = {
  command: string;
  ok: boolean;
  output: string;
  durationSeconds: number;
};

type RestoreDrillReport = {
  ok?: boolean;
  generatedAt?: string;
};

type SentinelReport = {
  ok: boolean;
  generatedAt: string;
  durationSeconds: number;
  backupMonitor: CommandRun;
  restoreDrill: {
    due: boolean;
    forced: boolean;
    skipped: boolean;
    lastSuccessAt: string | null;
    intervalDays: number;
    commandRun: CommandRun | null;
  };
  error: string | null;
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

function booleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  return !["0", "false", "no"].includes(raw.trim().toLowerCase());
}

function runPnpmScript(scriptName: string): CommandRun {
  const startedAt = Date.now();
  const command = `pnpm ${scriptName}`;
  try {
    const output = execFileSync("pnpm", [scriptName], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return {
      command,
      ok: true,
      output,
      durationSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(3)),
    };
  } catch (error: unknown) {
    const commandError = error as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
    const stdout = commandError.stdout ? String(commandError.stdout).trim() : "";
    const stderr = commandError.stderr ? String(commandError.stderr).trim() : "";
    const message = commandError.message ?? "command failed";
    return {
      command,
      ok: false,
      output: [stdout, stderr, message].filter((part) => part.length > 0).join("\n"),
      durationSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(3)),
    };
  }
}

function restoreDrillReportDir(): string {
  return path.resolve(DEFAULT_OUTPUT_DIR, "restore-drill");
}

function sentinelReportDir(): string {
  return path.resolve(optionalEnv("PROPERTY_DB_DR_SENTINEL_OUTPUT_DIR", path.join(DEFAULT_OUTPUT_DIR, "dr-sentinel")));
}

function latestSuccessfulDrillAt(): string | null {
  const reportDir = restoreDrillReportDir();
  if (!existsSync(reportDir)) {
    return null;
  }
  return readdirSync(reportDir)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => {
      const reportPath = path.join(reportDir, fileName);
      const report = JSON.parse(readFileSync(reportPath, "utf8")) as RestoreDrillReport;
      return report.ok === true && report.generatedAt ? report.generatedAt : null;
    })
    .filter((generatedAt): generatedAt is string => Boolean(generatedAt))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
}

function drillIsDue(lastSuccessAt: string | null, intervalDays: number): boolean {
  if (!lastSuccessAt) {
    return true;
  }
  const lastSuccessTime = new Date(lastSuccessAt).getTime();
  if (Number.isNaN(lastSuccessTime)) {
    return true;
  }
  return Date.now() - lastSuccessTime >= intervalDays * 24 * 60 * 60 * 1000;
}

function writeReport(report: SentinelReport): string {
  const reportDir = sentinelReportDir();
  mkdirSync(reportDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `dr-sentinel-${stamp}.json`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(reportDir, "latest.json"), `${JSON.stringify(report, null, 2)}\n`);
  return reportPath;
}

async function sendSentryFailure(report: SentinelReport): Promise<void> {
  const dsn = process.env.PROPERTY_DB_DR_SENTRY_DSN ?? process.env.SENTRY_DSN;
  if (!dsn) {
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
      level: "error",
      platform: "node",
      logger: "property-db-dr-sentinel",
      message: report.error ?? "Property DB DR sentinel failed",
      tags: {
        component: "property-db",
        monitor: "dr-sentinel",
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
  const args = new Set(process.argv.slice(2));
  const intervalDays = numberEnv("PROPERTY_DB_DR_DRILL_INTERVAL_DAYS", DEFAULT_DRILL_INTERVAL_DAYS);
  const forced = args.has("--force-drill") || booleanEnv("PROPERTY_DB_DR_FORCE_DRILL", false);
  const skipped = args.has("--skip-drill") || booleanEnv("PROPERTY_DB_DR_SKIP_DRILL", false);
  const lastSuccessAt = latestSuccessfulDrillAt();
  const due = !skipped && (forced || drillIsDue(lastSuccessAt, intervalDays));
  const backupMonitor = runPnpmScript("property-db:backup:monitor");
  let restoreDrillRun: CommandRun | null = null;
  let error: string | null = backupMonitor.ok ? null : backupMonitor.output;

  if (backupMonitor.ok && due) {
    restoreDrillRun = runPnpmScript("property-db:restore:drill");
    if (!restoreDrillRun.ok) {
      error = restoreDrillRun.output;
    }
  }

  const report: SentinelReport = {
    ok: error === null,
    generatedAt: new Date().toISOString(),
    durationSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(3)),
    backupMonitor,
    restoreDrill: {
      due,
      forced,
      skipped,
      lastSuccessAt,
      intervalDays,
      commandRun: restoreDrillRun,
    },
    error,
  };
  const reportPath = writeReport(report);

  if (!report.ok) {
    await sendSentryFailure(report);
    console.error(`[property-db-dr-sentinel] failed report=${reportPath} error=${report.error}`);
    process.exit(1);
  }

  console.log(
    `[property-db-dr-sentinel] ok report=${reportPath} monitorSeconds=${backupMonitor.durationSeconds} drillDue=${due} drillSeconds=${restoreDrillRun?.durationSeconds ?? 0}`,
  );
}

main().catch((error: unknown) => {
  console.error(`[property-db-dr-sentinel] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
