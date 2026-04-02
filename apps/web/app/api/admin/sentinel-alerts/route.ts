import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@entitlement-os/db";
import * as Sentry from "@sentry/nextjs";
import { authorizeApiRoute } from "@/lib/auth/authorizeApiRoute";

export const runtime = "nodejs";

/**
 * Internal sentinel alert receiver.
 *
 * POST — Receives alert payloads from the CLI sentinel runner and persists
 *         them to the automation_events table for querying.
 * GET  — Returns recent sentinel alerts (last 24h).
 *
 * Auth: SENTINEL_WEBHOOK_SECRET or CRON_SECRET via Authorization header.
 */

function timingSafeTokenMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

const SENTINEL_ORG_ID = "00000000-0000-0000-0000-000000000001";

export async function POST(request: Request) {
  const authorization = await authorizeApiRoute(
    request as NextRequest,
    "/api/admin/sentinel-alerts",
  );
  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const body = await request.json();

    await prisma.automationEvent.create({
      data: {
        orgId: SENTINEL_ORG_ID,
        handlerName: "stability-sentinel-cli",
        eventType: "sentinel.alert",
        status: "completed",
        inputData: (body ?? {}) as object,
        outputData: {
          source: "webhook",
          verdict: body?.verdict ?? "UNKNOWN",
          failCount: body?.failCount ?? 0,
          warnCount: body?.warnCount ?? 0,
        } as object,
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 0,
      },
    });

    return NextResponse.json({ ok: true, stored: true });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.admin.sentinel-alerts", method: "POST" },
    });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Storage failed" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const authorization = await authorizeApiRoute(
    request as NextRequest,
    "/api/admin/sentinel-alerts",
  );
  if (!authorization.ok) {
    return authorization.response;
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const alerts = await prisma.automationEvent.findMany({
    where: {
      handlerName: { in: ["stability-sentinel", "stability-sentinel-cli"] },
      eventType: "sentinel.alert",
      startedAt: { gte: since },
    },
    orderBy: { startedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    ok: true,
    count: alerts.length,
    alerts: alerts.map((a) => ({
      id: a.id,
      source: a.handlerName,
      inputData: a.inputData,
      outputData: a.outputData,
      startedAt: a.startedAt.toISOString(),
    })),
  });
}
