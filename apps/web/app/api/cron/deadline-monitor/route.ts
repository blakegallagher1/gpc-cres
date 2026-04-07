import crypto from "crypto";
import { NextResponse } from "next/server";
import { runDeadlineMonitorCron } from "@gpc/server/jobs/deadline-monitor-cron.service";
import { runWithCronMonitor } from "@/lib/automation/sentry";

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
      const result = await runDeadlineMonitorCron();

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
