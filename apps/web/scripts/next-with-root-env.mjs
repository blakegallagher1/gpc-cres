import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import dotenv from "dotenv";

const require = createRequire(import.meta.url);
const appRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(appRoot, "..", "..");
const shellKeys = new Set(Object.keys(process.env));
const env = { ...process.env };

for (const file of [
  path.join(repoRoot, ".env"),
  path.join(repoRoot, ".env.local"),
  path.join(appRoot, ".env"),
  path.join(appRoot, ".env.local"),
]) {
  if (!fs.existsSync(file)) continue;
  const parsed = dotenv.parse(fs.readFileSync(file));
  for (const [key, value] of Object.entries(parsed)) {
    if (shellKeys.has(key)) continue;
    env[key] = value;
  }
}

const nextBin = require.resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, ...process.argv.slice(2)], {
  cwd: appRoot,
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
