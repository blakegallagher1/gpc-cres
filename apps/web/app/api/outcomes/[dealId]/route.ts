import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  DealOutcomePatchInputSchema,
} from "@entitlement-os/shared";
import {
  getDealOutcomeForOrg,
  updateDealOutcomeForOrg,
} from "@/lib/services/outcomeTracking.service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { dealId } = await params;
    const outcome = await getDealOutcomeForOrg(auth.orgId, dealId);
    if (!outcome) {
      return NextResponse.json({ error: "Outcome not found" }, { status: 404 });
    }

    return NextResponse.json({ outcome });
  } catch (error) {
    console.error("Outcome get error:", error);
    return NextResponse.json(
      { error: "Failed to fetch outcome" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { dealId } = await params;
  const body = await request.json();

  const parsed = DealOutcomePatchInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid outcome payload", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const outcome = await updateDealOutcomeForOrg(
      auth.orgId,
      dealId,
      parsed.data,
    );
    return NextResponse.json({ outcome });
  } catch (error) {
    if (error instanceof Error && error.message === "Outcome not found") {
      return NextResponse.json(
        { error: "Outcome not found" },
        { status: 404 },
      );
    }

    if (error instanceof Error && error.message === "Deal not found") {
      return NextResponse.json(
        { error: "Deal not found" },
        { status: 404 },
      );
    }

    console.error("Outcome patch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}
