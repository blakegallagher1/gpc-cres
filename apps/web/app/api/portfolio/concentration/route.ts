import { NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { getConcentrationAnalysis } from "@/lib/services/portfolioAnalytics.service";

export async function GET() {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const concentration = await getConcentrationAnalysis(auth.orgId);
    return NextResponse.json(concentration);
  } catch (error) {
    console.error("Concentration analysis error:", error);
    return NextResponse.json(
      { error: "Failed to compute concentration analysis" },
      { status: 500 }
    );
  }
}
