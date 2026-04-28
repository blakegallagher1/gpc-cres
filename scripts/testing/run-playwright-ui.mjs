#!/usr/bin/env node
import { mkdirSync, openSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const DEFAULT_PROJECT = "chromium";
const DEFAULT_PORT = "3100";
const OUTPUT_DIR = "output/playwright";

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function quote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function splitArgs(argv) {
  const background = argv.includes("--background");
  const args = argv.filter((arg) => arg !== "--background" && arg !== "--");
  const hasProject = args.some((arg) => arg === "--project" || arg.startsWith("--project="));
  return {
    background,
    playwrightArgs: hasProject ? args : [...args, `--project=${DEFAULT_PROJECT}`],
  };
}

function buildEnv() {
  return {
    ...process.env,
    NEXT_PUBLIC_DISABLE_AUTH: process.env.NEXT_PUBLIC_DISABLE_AUTH ?? "true",
    PLAYWRIGHT_PORT: process.env.PLAYWRIGHT_PORT ?? DEFAULT_PORT,
  };
}

function runForeground(playwrightArgs, env) {
  const result = spawnSync(
    "pnpm",
    ["-C", "apps/web", "exec", "playwright", "test", ...playwrightArgs],
    { cwd: process.cwd(), env, stdio: "inherit" },
  );
  process.exit(result.status ?? 1);
}

function runBackground(playwrightArgs, env) {
  const outDir = resolve(process.cwd(), OUTPUT_DIR);
  mkdirSync(outDir, { recursive: true });

  const id = `e2e-ui-${stamp()}`;
  const logPath = join(outDir, `${id}.log`);
  const exitPath = join(outDir, `${id}.exit.json`);
  const command = ["pnpm", "-C", "apps/web", "exec", "playwright", "test", ...playwrightArgs]
    .map(quote)
    .join(" ");
  const wrapped = `${command}; status=$?; printf '{"status":%s,"finishedAt":"%s","logPath":"%s"}\\n' "$status" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" ${quote(logPath)} > ${quote(exitPath)}`;

  const outFd = openSync(logPath, "a");
  const child = spawn("sh", ["-lc", wrapped], {
    cwd: process.cwd(),
    detached: true,
    env,
    stdio: ["ignore", outFd, outFd],
  });
  child.unref();

  console.log(`Started Playwright UI sweep pid=${child.pid}`);
  console.log(`Log: ${logPath}`);
  console.log(`Exit sentinel: ${exitPath}`);
  console.log(`Watch: tail -f ${logPath}`);
}

const { background, playwrightArgs } = splitArgs(process.argv.slice(2));
const env = buildEnv();
if (background) {
  runBackground(playwrightArgs, env);
} else {
  runForeground(playwrightArgs, env);
}
