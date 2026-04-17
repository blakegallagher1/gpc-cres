import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";

import {
  AssetManagementAccessError,
  listAssetPerformancePeriods,
  upsertAssetPerformancePeriod,
} from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const paramsSchema = z.object({ id: z.string().uuid() });

const upsertSchema = z.object({
  periodYear: z.number().int().min(1900).max(2200),
  periodMonth: z.number().int().min(1).max(12),
  rentBilled: z.number().nullable().optional(),
  rentCollected: z.number().nullable().optional(),
  vacancyUnits: z.number().int().min(0).nullable().optional(),
  totalUnits: z.number().int().min(0).nullable().optional(),
  operatingExpense: z.number().nullable().optional(),
  netOperatingIncome: z.number().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid deal id" }, { status: 400 });
  }

  try {
    const periods = await listAssetPerformancePeriods(auth.orgId, parsed.data.id);
    return NextResponse.json({ periods });
  } catch (error) {
    if (error instanceof AssetManagementAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.performance", method: "GET" },
    });
    return NextResponse.json(
      { error: "Failed to load performance periods" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid deal id" }, { status: 400 });
  }

  let payload: z.infer<typeof upsertSchema>;
  try {
    payload = upsertSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid performance payload", issues: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const period = await upsertAssetPerformancePeriod({
      orgId: auth.orgId,
      dealId: parsed.data.id,
      periodYear: payload.periodYear,
      periodMonth: payload.periodMonth,
      rentBilled: payload.rentBilled ?? null,
      rentCollected: payload.rentCollected ?? null,
      vacancyUnits: payload.vacancyUnits ?? null,
      totalUnits: payload.totalUnits ?? null,
      operatingExpense: payload.operatingExpense ?? null,
      netOperatingIncome: payload.netOperatingIncome ?? null,
      notes: payload.notes ?? null,
      capturedBy: auth.userId,
    });
    return NextResponse.json({ period }, { status: 201 });
  } catch (error) {
    if (error instanceof AssetManagementAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.performance", method: "POST" },
    });
    return NextResponse.json(
      { error: "Failed to save performance period" },
      { status: 500 },
    );
  }
}
