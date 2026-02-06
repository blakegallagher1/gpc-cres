import { Worker, NativeConnection } from "@temporalio/worker";

import * as activities from "./activities/index.js";

async function run() {
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
  });

  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || "default",
    taskQueue: "entitlement-os",
    workflowsPath: new URL("./workflows/index.js", import.meta.url).pathname,
    activities,
  });

  console.log("Temporal worker started on task queue: entitlement-os");
  await worker.run();
}

run().catch((err) => {
  console.error("Worker failed:", err);
  process.exit(1);
});
