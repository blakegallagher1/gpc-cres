import crypto from "crypto";
import { NextResponse } from "next/server";
import { runMarketMonitoring } from "@/lib/automation/marketMonitoring";

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

// Vercel Cron Job: Market Monitor
// Schedule: "0 8 * * *" (daily at 8 AM)
export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runMarketMonitoring();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[cron.market-monitor] failed:", error);
    return NextResponse.json(
      { error: "Failed to run market monitor" },
      { status: 500 },
    );
  }
}
