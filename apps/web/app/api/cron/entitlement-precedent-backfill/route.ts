import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import type { Prisma } from "@entitlement-os/db";

import { backfillEntitlementOutcomePrecedents } from "@/lib/services/entitlementPrecedentBackfill.service";
import { runEntitlementKpiDriftMonitor } from "@/lib/services/entitlementKpiMonitor.service";

function verifyCronSecret(req: Request): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const header = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
  if (!header || header.length !== secret.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(header));
  } catch {
    return false;
  }
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Vercel Cron Job: Entitlement Precedent Backfill
 * Ingests connector records from RSS, Socrata, and ArcGIS seed sources
 * and upserts structured entitlement precedents for prediction calibration.
 */
export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestUrl = new URL(req.url);
  const jurisdictionId = requestUrl.searchParams.get("jurisdictionId");
  const sourceLimit = Number(requestUrl.searchParams.get("sourceLimit") ?? "25");
  const recordsPerSource = Number(requestUrl.searchParams.get("recordsPerSource") ?? "75");
  const evidenceLinksPerRecord = Number(requestUrl.searchParams.get("evidenceLinksPerRecord") ?? "2");

  const orgs = await prisma.org.findMany({
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (orgs.length === 0) {
    return NextResponse.json({ ok: true, message: "No orgs available for backfill." });
  }

  const orgResults: Array<Record<string, unknown>> = [];

  for (const org of orgs) {
    const run = await prisma.run.create({
      data: {
        orgId: org.id,
        runType: "ENRICHMENT",
        jurisdictionId: jurisdictionId ?? null,
        status: "running",
      },
    });

    try {
      const summary = await backfillEntitlementOutcomePrecedents({
        orgId: org.id,
        runId: run.id,
        jurisdictionId,
        sourceLimit: Number.isFinite(sourceLimit) ? sourceLimit : 25,
        recordsPerSource: Number.isFinite(recordsPerSource) ? recordsPerSource : 75,
        evidenceLinksPerRecord: Number.isFinite(evidenceLinksPerRecord) ? evidenceLinksPerRecord : 2,
      });

      let kpiMonitorSummary: Prisma.InputJsonValue | null = null;
      try {
        kpiMonitorSummary = toInputJsonValue(await runEntitlementKpiDriftMonitor({
          orgId: org.id,
          jurisdictionId: jurisdictionId ?? undefined,
        }));
      } catch (monitorError) {
        kpiMonitorSummary = toInputJsonValue({
          success: false,
          error: monitorError instanceof Error ? monitorError.message : String(monitorError),
        });
      }

      await prisma.run.update({
        where: { id: run.id },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
          outputJson: {
            ...summary,
            kpiMonitor: kpiMonitorSummary,
          },
        },
      });

      orgResults.push({
        runId: run.id,
        status: "succeeded",
        ...summary,
        kpiMonitor: kpiMonitorSummary,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.run.update({
        where: { id: run.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          error: message.slice(0, 10_000),
        },
      });

      orgResults.push({
        orgId: org.id,
        runId: run.id,
        status: "failed",
        error: message,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    orgsProcessed: orgResults.length,
    results: orgResults,
  });
}
