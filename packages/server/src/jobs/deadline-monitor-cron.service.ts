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
  const start = Date.now();
  const orgs = await prisma.org.findMany({ select: { id: true } });
  if (orgs.length === 0) {
    return {
      success: true,
      tasksScanned: 0,
      notificationsCreated: 0,
      errors: [],
      duration_ms: Date.now() - start,
    };
  }

  const job = new DeadlineMonitorJob();
  const aggregate: DeadlineMonitorCronResult = {
    success: true,
    tasksScanned: 0,
    notificationsCreated: 0,
    errors: [],
    duration_ms: 0,
  };

  for (const org of orgs) {
    const runId = await createRunAudit(org.id);
    const result = await job.execute({ orgId: org.id });
    await updateRunAudit(runId, result);

    aggregate.success = aggregate.success && result.success;
    aggregate.tasksScanned += result.tasksScanned;
    aggregate.notificationsCreated += result.notificationsCreated;
    aggregate.errors.push(...result.errors);
  }

  aggregate.duration_ms = Date.now() - start;
  return aggregate;
}
