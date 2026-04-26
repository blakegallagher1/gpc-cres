import "dotenv/config";

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_REPORT_DIR = "output/deploy/guarded";
const DEFAULT_SENTINEL_REPORT = "output/observability/ops-sentinel/latest.json";

type CommandRun = {
  command: string;
  ok: boolean;
  output: string;
  durationSeconds: number;
};

type Deployment = {
  url: string;
  state: string;
  target: string | null;
  createdAt: number;
  meta: {
    githubCommitSha?: string;
    githubCommitMessage?: string;
  };
};

type SentinelRun = CommandRun & {
  reportPath: string | null;
  reportOk: boolean | null;
};

type RollbackReport = {
  attempted: boolean;
  targetUrl: string | null;
  commandRun: CommandRun | null;
  sentinelAfterRollback: SentinelRun | null;
};

type GuardedDeployReport = {
  ok: boolean;
  generatedAt: string;
  durationSeconds: number;
  commitSha: string;
  branch: string;
  options: {
    dryRun: boolean;
    fast: boolean;
    force: boolean;
    prebuilt: boolean;
    rollback: boolean;
    sentinelDryRun: boolean;
    skipPreflightSentinel: boolean;
  };
  previousProduction: Deployment | null;
  preflightSentinel: SentinelRun | null;
  typecheck: CommandRun | null;
  build: CommandRun | null;
  deploy: CommandRun | null;
  deploymentUrl: string | null;
  inspect: CommandRun | null;
  postDeploySentinel: SentinelRun | null;
  rollback: RollbackReport;
  error: string | null;
};

type Options = GuardedDeployReport["options"] & {
  reportDir: string;
};

type RunOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxOutputChars?: number;
};

function elapsedSeconds(startedAt: number): number {
  return Number(((Date.now() - startedAt) / 1000).toFixed(3));
}

function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : fallback;
}

function trimOutput(output: string, maxOutputChars = 8_000): string {
  return output.trim().slice(0, maxOutputChars);
}

function runCommand(command: string, args: string[], options: RunOptions = {}): CommandRun {
  const startedAt = Date.now();
  const printableCommand = [command, ...args].join(" ");
  try {
    const output = execFileSync(command, args, {
      cwd: options.cwd,
      encoding: "utf8",
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return {
      command: printableCommand,
      ok: true,
      output: trimOutput(output, options.maxOutputChars),
      durationSeconds: elapsedSeconds(startedAt),
    };
  } catch (error: unknown) {
    const commandError = error as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
    const output = [
      commandError.stdout ? String(commandError.stdout).trim() : "",
      commandError.stderr ? String(commandError.stderr).trim() : "",
      commandError.message ?? "command failed",
    ]
      .filter((part) => part.length > 0)
      .join("\n");
    return {
      command: printableCommand,
      ok: false,
      output: trimOutput(output, options.maxOutputChars),
      durationSeconds: elapsedSeconds(startedAt),
    };
  }
}

function parseOptions(): Options {
  const args = new Set(process.argv.slice(2));
  return {
    dryRun: args.has("--dry-run") || args.has("--dry"),
    fast: args.has("--fast"),
    force: args.has("--force") || args.has("-y"),
    prebuilt: args.has("--prebuilt"),
    rollback: !args.has("--no-rollback"),
    sentinelDryRun: args.has("--sentinel-dry-run"),
    skipPreflightSentinel: args.has("--skip-preflight-sentinel"),
    reportDir: path.resolve(optionalEnv("GUARDED_DEPLOY_REPORT_DIR", DEFAULT_REPORT_DIR)),
  };
}

function requireCleanBranch(options: Options): { branch: string; commitSha: string } {
  const branch = runCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branch.ok) {
    throw new Error(branch.output || "Unable to read git branch.");
  }
  const commit = runCommand("git", ["rev-parse", "HEAD"]);
  if (!commit.ok) {
    throw new Error(commit.output || "Unable to read git commit.");
  }
  const status = runCommand("git", ["status", "--porcelain"]);
  if (status.ok && status.output.length > 0 && !options.force) {
    throw new Error(`Working tree is dirty. Commit first or rerun with --force.\n${status.output}`);
  }
  if (branch.output !== "main" && !options.force) {
    throw new Error(`Refusing guarded production deploy from branch ${branch.output}. Rerun with --force to override.`);
  }
  return { branch: branch.output, commitSha: commit.output };
}

function parseDeployments(raw: string): Deployment[] {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Vercel list returned a non-object response.");
  }
  const deployments = (parsed as { deployments?: unknown }).deployments;
  if (!Array.isArray(deployments)) {
    throw new Error("Vercel list response is missing deployments array.");
  }
  return deployments.flatMap((deployment): Deployment[] => {
    if (!deployment || typeof deployment !== "object" || Array.isArray(deployment)) {
      return [];
    }
    const record = deployment as Record<string, unknown>;
    if (typeof record.url !== "string" || typeof record.state !== "string" || typeof record.createdAt !== "number") {
      return [];
    }
    const meta = record.meta && typeof record.meta === "object" && !Array.isArray(record.meta)
      ? (record.meta as Deployment["meta"])
      : {};
    return [
      {
        url: record.url,
        state: record.state,
        target: typeof record.target === "string" ? record.target : null,
        createdAt: record.createdAt,
        meta,
      },
    ];
  });
}

function latestProductionDeployment(): Deployment | null {
  const result = runCommand("pnpm", [
    "exec",
    "vercel",
    "list",
    "--environment",
    "production",
    "--status",
    "READY",
    "--format",
    "json",
    "--yes",
  ], { maxOutputChars: 250_000 });
  if (!result.ok) {
    throw new Error(`Unable to list Vercel deployments: ${result.output}`);
  }
  return parseDeployments(result.output)[0] ?? null;
}

function readSentinelReport(): { path: string | null; ok: boolean | null } {
  const reportPath = path.resolve(optionalEnv("OPS_SENTINEL_REPORT_PATH", DEFAULT_SENTINEL_REPORT));
  if (!existsSync(reportPath)) {
    return { path: null, ok: null };
  }
  const parsed: unknown = JSON.parse(readFileSync(reportPath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { path: reportPath, ok: null };
  }
  const ok = (parsed as { ok?: unknown }).ok;
  return { path: reportPath, ok: typeof ok === "boolean" ? ok : null };
}

function runSentinel(options: Options): SentinelRun {
  const env = {
    ...process.env,
    ...(options.sentinelDryRun ? { OPS_SENTINEL_DRY_RUN: "true" } : {}),
  };
  const commandRun = runCommand("pnpm", ["ops:sentinel"], { env });
  const report = readSentinelReport();
  return { ...commandRun, reportPath: report.path, reportOk: report.ok };
}

function runTypecheck(options: Options): CommandRun | null {
  if (options.fast) {
    return null;
  }
  console.log("[guarded-deploy] typecheck");
  return runCommand("pnpm", ["typecheck"]);
}

function runBuild(options: Options): CommandRun {
  console.log("[guarded-deploy] build");
  return runCommand("bash", ["scripts/vercel-build.sh"], {
    env: options.fast ? { ...process.env, SENTRY_AUTH_TOKEN: "" } : process.env,
  });
}

function runDeploy(options: Options): CommandRun {
  console.log("[guarded-deploy] deploy production");
  if (!options.prebuilt) {
    return runCommand("pnpm", ["exec", "vercel", "deploy", "--prod", "--archive=tgz", "--yes"]);
  }
  const build = runCommand("pnpm", ["exec", "vercel", "build", "--prod", "--yes"], {
    cwd: path.resolve("apps/web"),
  });
  if (!build.ok) {
    return build;
  }
  return runCommand("pnpm", ["exec", "vercel", "deploy", "--prebuilt", "--prod", "--archive=tgz", "--yes"], {
    cwd: path.resolve("apps/web"),
  });
}

function parseDeploymentUrl(output: string): string | null {
  const matches = output.match(/https?:\/\/[^\s]+\.vercel\.app|[a-z0-9][a-z0-9-]*\.vercel\.app/gi) ?? [];
  return matches.find((candidate) => candidate.includes(".vercel.app")) ?? null;
}

function normalizeUrl(url: string): string {
  return url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`;
}

function inspectDeployment(deploymentUrl: string): CommandRun {
  return runCommand("pnpm", [
    "exec",
    "vercel",
    "inspect",
    normalizeUrl(deploymentUrl),
    "--wait",
    "--timeout",
    "5m",
    "--format",
    "json",
  ]);
}

function rollbackDeployment(target: Deployment | null, options: Options): RollbackReport {
  if (!options.rollback || !target) {
    return { attempted: false, targetUrl: target?.url ?? null, commandRun: null, sentinelAfterRollback: null };
  }
  console.log(`[guarded-deploy] rollback to ${target.url}`);
  const commandRun = runCommand("pnpm", [
    "exec",
    "vercel",
    "rollback",
    normalizeUrl(target.url),
    "--yes",
    "--timeout",
    "5m",
  ]);
  const sentinelAfterRollback = commandRun.ok ? runSentinel(options) : null;
  return { attempted: true, targetUrl: target.url, commandRun, sentinelAfterRollback };
}

function writeReport(reportDir: string, report: GuardedDeployReport): string {
  mkdirSync(reportDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `guarded-deploy-${stamp}.json`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(reportDir, "latest.json"), `${JSON.stringify(report, null, 2)}\n`);
  return reportPath;
}

function initialReport(options: Options, branch: string, commitSha: string, startedAt: number): GuardedDeployReport {
  return {
    ok: false,
    generatedAt: new Date().toISOString(),
    durationSeconds: elapsedSeconds(startedAt),
    commitSha,
    branch,
    options: {
      dryRun: options.dryRun,
      fast: options.fast,
      force: options.force,
      prebuilt: options.prebuilt,
      rollback: options.rollback,
      sentinelDryRun: options.sentinelDryRun,
      skipPreflightSentinel: options.skipPreflightSentinel,
    },
    previousProduction: null,
    preflightSentinel: null,
    typecheck: null,
    build: null,
    deploy: null,
    deploymentUrl: null,
    inspect: null,
    postDeploySentinel: null,
    rollback: { attempted: false, targetUrl: null, commandRun: null, sentinelAfterRollback: null },
    error: null,
  };
}

function assertRunOk(run: CommandRun | SentinelRun | null, label: string): void {
  if (run && !run.ok) {
    throw new Error(`${label} failed: ${run.output}`);
  }
}

function main(): void {
  const startedAt = Date.now();
  const options = parseOptions();
  const { branch, commitSha } = requireCleanBranch(options);
  const report = initialReport(options, branch, commitSha, startedAt);

  try {
    report.previousProduction = latestProductionDeployment();
    console.log(`[guarded-deploy] previousProduction=${report.previousProduction?.url ?? "none"}`);

    report.typecheck = runTypecheck(options);
    assertRunOk(report.typecheck, "typecheck");

    report.build = runBuild(options);
    assertRunOk(report.build, "build");

    if (!options.skipPreflightSentinel) {
      console.log("[guarded-deploy] preflight sentinel");
      report.preflightSentinel = runSentinel(options);
      assertRunOk(report.preflightSentinel, "preflight sentinel");
    }

    if (options.dryRun) {
      report.ok = true;
      report.durationSeconds = elapsedSeconds(startedAt);
      const reportPath = writeReport(options.reportDir, report);
      console.log(`[guarded-deploy] dry-run ok report=${reportPath}`);
      return;
    }

    report.deploy = runDeploy(options);
    assertRunOk(report.deploy, "deploy");
    report.deploymentUrl = parseDeploymentUrl(report.deploy.output) ?? latestProductionDeployment()?.url ?? null;
    if (!report.deploymentUrl) {
      throw new Error("Unable to identify deployment URL after production deploy.");
    }

    report.inspect = inspectDeployment(report.deploymentUrl);
    assertRunOk(report.inspect, "inspect");

    console.log("[guarded-deploy] post-deploy sentinel");
    report.postDeploySentinel = runSentinel(options);
    if (!report.postDeploySentinel.ok) {
      report.rollback = rollbackDeployment(report.previousProduction, options);
      const rollbackRestored = report.rollback.sentinelAfterRollback?.ok === true;
      throw new Error(
        `post-deploy sentinel failed${rollbackRestored ? "; rollback sentinel passed" : "; rollback did not restore a passing sentinel"}`,
      );
    }

    report.ok = true;
  } catch (error: unknown) {
    report.error = error instanceof Error ? error.message : String(error);
  } finally {
    report.durationSeconds = elapsedSeconds(startedAt);
    const reportPath = writeReport(options.reportDir, report);
    if (!report.ok) {
      console.error(`[guarded-deploy] failed report=${reportPath} error=${report.error}`);
      process.exit(1);
    }
    console.log(`[guarded-deploy] ok report=${reportPath} deployment=${report.deploymentUrl ?? "dry-run"}`);
  }
}

main();
