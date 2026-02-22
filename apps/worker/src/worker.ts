import { Worker, NativeConnection } from "@temporalio/worker";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import * as activities from "./activities/index.js";

// Zero-cost migration: Temporal is optional. Only run when explicitly enabled.
if (process.env.ENABLE_TEMPORAL !== "true") {
  console.log("Temporal worker skipped (ENABLE_TEMPORAL not set)");
  process.exit(0);
}

const resolveWorkflowsPath = () => {
  const tsPath = fileURLToPath(new URL("./workflows/index.ts", import.meta.url));
  const jsPath = fileURLToPath(new URL("./workflows/index.js", import.meta.url));

  if (existsSync(jsPath)) return jsPath;
  if (existsSync(tsPath)) return tsPath;

  throw new Error(
    `Unable to resolve workflow entrypoint. Checked: ${jsPath}, ${tsPath}`,
  );
};

async function run() {
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
  });

  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || "default",
    taskQueue: "entitlement-os",
    workflowsPath: resolveWorkflowsPath(),
    activities,
  });

  console.log("Temporal worker started on task queue: entitlement-os");
  await worker.run();
}

run().catch((err) => {
  const isCritical =
    process.env.TEMPORAL_REQUIRED === "true" ||
    process.env.NODE_ENV === "production" ||
    process.env.CI === "true";

  console.error("Worker failed:", err);
  if (isCritical) {
    process.exit(1);
  }

  console.error("Temporal unavailable; worker is running in degraded startup mode.");
  return new Promise<never>(() => {});
});
