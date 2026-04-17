import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";
import {
  loadInvestmentCriteria,
  updateInvestmentCriteria,
} from "@gpc/server/services/investment-criteria.service";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const putSchema = z.object({
  minIrrPct: z.number().nullable().optional(),
  maxLtvPct: z.number().nullable().optional(),
  minDscr: z.number().nullable().optional(),
  preferredAssetClasses: z.array(z.string()).max(50).optional(),
  preferredStrategies: z.array(z.string()).max(50).optional(),
  preferredStates: z.array(z.string()).max(50).optional(),
  minAcreage: z.number().nullable().optional(),
  maxAcreage: z.number().nullable().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const criteria = await loadInvestmentCriteria(auth.orgId);
    return NextResponse.json({ criteria });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.org.investment-criteria", method: "GET" },
    });
    return NextResponse.json({ error: "Failed to load criteria" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: z.infer<typeof putSchema>;
  try {
    payload = putSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid payload", issues: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const criteria = await updateInvestmentCriteria({
      orgId: auth.orgId,
      userId: auth.userId,
      ...payload,
    });
    return NextResponse.json({ criteria });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.org.investment-criteria", method: "PUT" },
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update" },
      { status: 500 },
    );
  }
}
