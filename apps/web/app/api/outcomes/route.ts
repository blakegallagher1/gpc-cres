import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  upsertDealOutcome,
  getDealOutcome,
  getOutcomeSummary,
  recordAssumptionActuals,
  getHistoricalAccuracy,
} from "@/lib/services/outcomeTracking.service";

export async function GET(req: NextRequest) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") ?? "summary";
  const dealId = searchParams.get("dealId") ?? undefined;

  try {
    switch (view) {
      case "deal": {
        if (!dealId) {
          return NextResponse.json(
            { error: "dealId is required for deal view" },
            { status: 400 }
          );
        }
        const outcome = await getDealOutcome(dealId);
        return NextResponse.json({ outcome });
      }
      case "accuracy": {
        const accuracy = await getHistoricalAccuracy(auth.orgId);
        return NextResponse.json(accuracy);
      }
      case "summary":
      default: {
        const summary = await getOutcomeSummary(auth.orgId);
        return NextResponse.json(summary);
      }
    }
  } catch (error) {
    console.error("Outcomes error:", error);
    return NextResponse.json(
      { error: "Failed to fetch outcome data" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action, dealId } = body;

    if (!dealId) {
      return NextResponse.json(
        { error: "dealId is required" },
        { status: 400 }
      );
    }

    switch (action) {
      case "record_outcome": {
        const id = await upsertDealOutcome(dealId, auth.userId, body.data ?? {});
        return NextResponse.json({ id });
      }
      case "record_actuals": {
        if (!Array.isArray(body.actuals)) {
          return NextResponse.json(
            { error: "actuals array is required" },
            { status: 400 }
          );
        }
        const count = await recordAssumptionActuals(dealId, body.actuals);
        return NextResponse.json({ count });
      }
      default:
        return NextResponse.json(
          { error: "Invalid action. Use: record_outcome, record_actuals" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Record outcome error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 }
    );
  }
}
