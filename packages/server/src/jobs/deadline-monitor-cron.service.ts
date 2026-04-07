import { prisma } from "@entitlement-os/db";
import { DeadlineMonitorJob } from "./deadline-monitor.job";

export interface DeadlineMonitorCronResult {
  success: boolean;
  tasksScanned: number;
  notificationsCreated: number;
  errors: string[];
  duration_ms: number;
}

async function createRunAudit(orgId: string): Promise<string> {
  const run = await prisma.run.create({
    data: {
      orgId,
      runType: "DEADLINE_MONITOR",
      status: "running",
    },
  });

  return run.id;
}

async function updateRunAudit(
  runId: string,
  result: DeadlineMonitorCronResult,
): Promise<void> {
  await prisma.run.update({
    where: { id: runId },
    data: {
      status: result.success ? "succeeded" : "failed",
      finishedAt: new Date(),
      error: result.errors.length > 0 ? result.errors.join("; ") : null,
      outputJson: {
        tasksScanned: result.tasksScanned,
        notificationsCreated: result.notificationsCreated,
        duration_ms: result.duration_ms,
      },
    },
  });
}

export async function runDeadlineMonitorCron(): Promise<DeadlineMonitorCronResult> {
  const firstOrg = await prisma.org.findFirst({ select: { id: true } });
  if (!firstOrg) {
    throw new Error("No org found");
  }

  const runId = await createRunAudit(firstOrg.id);
  const job = new DeadlineMonitorJob();
  const result = await job.execute();
  await updateRunAudit(runId, result);
  return result;
}
