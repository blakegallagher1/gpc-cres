import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import "@/lib/automation/handlers";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { getLatestDealTriage, runDealTriage } from "@gpc/server/deals/triage.service";

function mapTriageError(error: unknown): { status: number; body: { error: string } } {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "Deal not found") {
    return { status: 404, body: { error: message } };
  }
  if (message === "Deal must have at least one parcel to run triage") {
    return { status: 400, body: { error: message } };
  }
  return { status: 500, body: { error: "Failed to run triage" } };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const result = await runDealTriage({
      dealId: id,
      orgId: auth.orgId,
      userId: auth.userId,
    });

    return NextResponse.json(result.body, { status: result.statusCode });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals.triage", method: "POST" },
    });
    const mapped = mapTriageError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const result = await getLatestDealTriage({
      dealId: id,
      orgId: auth.orgId,
    });

    return NextResponse.json(result);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals.triage", method: "GET" },
    });
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Deal not found" ? 404 : 500;
    return NextResponse.json(
      { error: status === 404 ? message : "Failed to fetch triage" },
      { status },
    );
  }
}
