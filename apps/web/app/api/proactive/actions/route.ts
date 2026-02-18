import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { listProactiveActions } from "@/lib/services/proactiveAction.service";

const ActionStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "MODIFY_REQUESTED",
  "AUTO_EXECUTED",
  "EXPIRED",
  "FAILED",
]);

export async function GET(request: NextRequest) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const statusParam = request.nextUrl.searchParams.get("status");
    const parsedStatus = statusParam ? ActionStatusSchema.safeParse(statusParam) : null;
    if (statusParam && parsedStatus && !parsedStatus.success) {
      return NextResponse.json(
        { error: "Invalid status filter" },
        { status: 400 },
      );
    }
    const status =
      parsedStatus && parsedStatus.success ? parsedStatus.data : undefined;

    const actions = await listProactiveActions({
      orgId: auth.orgId,
      userId: auth.userId,
      status,
    });
    return NextResponse.json({ actions });
  } catch (error) {
    console.error("[proactive.actions.get]", error);
    return NextResponse.json(
      { error: "Failed to fetch actions" },
      { status: 500 },
    );
  }
}
