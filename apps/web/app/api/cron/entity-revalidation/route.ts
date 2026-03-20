import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { detectCollisions, persistCollisionAlerts } from "@/lib/services/entityCollisionDetector";
import * as Sentry from "@sentry/nextjs";

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

// Vercel Cron Job: Entity Revalidation
// Scans entities for address collisions and creates alerts.
export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const orgs = await prisma.org.findMany({ select: { id: true } });
    const summary: Array<{ orgId: string; collisionsFound: number; alertsCreated: number }> = [];

    for (const org of orgs) {
      const collisions = await detectCollisions(org.id);
      const created = await persistCollisionAlerts(org.id, collisions);
      summary.push({
        orgId: org.id,
        collisionsFound: collisions.length,
        alertsCreated: created,
      });
    }

    return NextResponse.json({
      success: true,
      orgsProcessed: orgs.length,
      summary,
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "api.cron.entity-revalidation", method: "GET" },
    });
    console.error("[cron/entity-revalidation] failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
