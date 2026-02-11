import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  getPendingApprovals,
  createApprovalRequest,
  approveRequest,
  rejectRequest,
  requestChanges,
  getPendingCount,
} from "@/lib/services/approval.service";
import type { DealStatus } from "@entitlement-os/shared";

export async function GET(req: NextRequest) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view");

  try {
    if (view === "count") {
      const count = await getPendingCount(auth.orgId);
      return NextResponse.json({ count });
    }

    const approvals = await getPendingApprovals(auth.orgId);
    return NextResponse.json({ approvals });
  } catch (error) {
    console.error("Approvals error:", error);
    return NextResponse.json(
      { error: "Failed to fetch approvals" },
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
    const { dealId, stageFrom, stageTo, supportingData } = body;

    if (!dealId || !stageFrom || !stageTo) {
      return NextResponse.json(
        { error: "dealId, stageFrom, and stageTo are required" },
        { status: 400 }
      );
    }

    const id = await createApprovalRequest(
      dealId,
      auth.userId,
      stageFrom as DealStatus,
      stageTo as DealStatus,
      supportingData
    );

    return NextResponse.json({ id });
  } catch (error) {
    console.error("Create approval error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { requestId, action, notes } = body;

    if (!requestId || !action) {
      return NextResponse.json(
        { error: "requestId and action are required" },
        { status: 400 }
      );
    }

    switch (action) {
      case "approve":
        await approveRequest(requestId, auth.userId, notes);
        break;
      case "reject":
        if (!notes) {
          return NextResponse.json(
            { error: "notes required for rejection" },
            { status: 400 }
          );
        }
        await rejectRequest(requestId, auth.userId, notes);
        break;
      case "changes_requested":
        if (!notes) {
          return NextResponse.json(
            { error: "notes required for change request" },
            { status: 400 }
          );
        }
        await requestChanges(requestId, auth.userId, notes);
        break;
      default:
        return NextResponse.json(
          { error: "Invalid action. Use: approve, reject, changes_requested" },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Approval action error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 }
    );
  }
}
