import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { DeadlineMonitorJob } from "@/lib/jobs/deadline-monitor.job";
import { runWithCronMonitor } from "@/lib/automation/sentry";
import { isSchemaDriftError } from "../../../../lib/api/prismaSchemaFallback";

function verifyCronSecret(req: Request): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const header = (req.headers.get("authorization") || "")
    .replace("Bearer ", "")
    .trim();
  if (!header || header.length !== secret.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(header));
  } catch {
    return false;
  }
}

async function createRunAudit(orgId: string): Promise<string | null> {
  try {
    const run = await prisma.run.create({
      data: {
        orgId,
        runType: "DEADLINE_MONITOR",
        status: "running",
      },
    });

    return run.id;
  } catch (error) {
    if (isSchemaDriftError(error)) {
      return null;
    }

    throw error;
  }
}

async function updateRunAudit(
  runId: string | null,
  result: {
    success: boolean;
    errors: string[];
    tasksScanned: number;
    notificationsCreated: number;
    duration_ms: number;
  },
): Promise<void> {
  if (!runId) {
    return;
  }

  try {
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
  } catch (error) {
    if (isSchemaDriftError(error)) {
      return;
    }

    throw error;
  }
}

// Vercel Cron Job: Deadline Monitor
// Runs hourly to check for approaching/overdue task deadlines.
// Schedule: "0 * * * *" (every hour)
export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runWithCronMonitor({
    slug: "deadline-monitor",
    schedule: "0 * * * *",
    handler: async () => {
      const firstOrg = await prisma.org.findFirst({ select: { id: true } });
      if (!firstOrg) {
        return NextResponse.json({ error: "No org found" }, { status: 500 });
      }

      const runId = await createRunAudit(firstOrg.id);

      const job = new DeadlineMonitorJob();
      const result = await job.execute();

      await updateRunAudit(runId, result);

      return NextResponse.json({
        success: result.success,
        tasksScanned: result.tasksScanned,
        notificationsCreated: result.notificationsCreated,
        errors: result.errors,
        duration_ms: result.duration_ms,
      });
    },
  });
}
