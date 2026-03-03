import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  logCounterfactual,
  getCounterfactualLogs,
  getOutcomeSummary,
} from "@/lib/services/counterfactualLearning";

// GET /api/memory/counterfactual — Get counterfactual deal logs + outcome summary
export async function GET(req: NextRequest) {
  try {
    const auth = await resolveAuth(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const outcome = searchParams.get("outcome") ?? undefined;
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);

    const [logs, summary] = await Promise.all([
      getCounterfactualLogs(auth.orgId, { outcome, limit }),
      getOutcomeSummary(auth.orgId),
    ]);

    return NextResponse.json({ logs, summary });
  } catch (error) {
    console.error("Error fetching counterfactual logs:", error);
    return NextResponse.json(
      { error: "Failed to fetch counterfactual logs" },
      { status: 500 },
    );
  }
}

// POST /api/memory/counterfactual — Log a counterfactual deal outcome
export async function POST(req: NextRequest) {
  try {
    const auth = await resolveAuth(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { dealId, outcome, rejectionReason, stageAtClose, projectionSnapshot, actualMetrics, lessonsLearned } = body;

    if (!dealId || !outcome || !stageAtClose) {
      return NextResponse.json(
        { error: "dealId, outcome, and stageAtClose are required" },
        { status: 400 },
      );
    }

    const result = await logCounterfactual({
      orgId: auth.orgId,
      dealId,
      outcome,
      rejectionReason,
      stageAtClose,
      projectionSnapshot,
      actualMetrics,
      lessonsLearned,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Error logging counterfactual:", error);
    return NextResponse.json(
      { error: "Failed to log counterfactual" },
      { status: 500 },
    );
  }
}
