import crypto from "crypto";
import { NextResponse } from "next/server";
import { runDeadlineMonitoring } from "@/lib/automation/deadlineMonitoring";

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

// Vercel Cron Job: Deadline Check
// Schedule: "0 7 * * *" (daily at 7 AM)
export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDeadlineMonitoring();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[cron.deadline-check] failed:", error);
    return NextResponse.json(
      { error: "Failed to run deadline monitoring" },
      { status: 500 },
    );
  }
}
