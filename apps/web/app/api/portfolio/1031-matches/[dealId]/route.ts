import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { get1031Matches } from "@/lib/services/portfolioAnalytics.service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { dealId } = await params;

  try {
    const result = await get1031Matches(auth.orgId, dealId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("1031 match error:", error);
    return NextResponse.json(
      { error: "Failed to find 1031 exchange matches" },
      { status: 500 }
    );
  }
}
