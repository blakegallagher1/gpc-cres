import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { dispatchEvent } from "@/lib/automation/events";
import "@/lib/automation/handlers";
import { ParcelTriageSchema } from "@entitlement-os/shared";

// GET /api/deals/[id] - get a single deal with related data
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const deal = await prisma.deal.findFirst({
      where: { id, orgId: auth.orgId },
      include: {
        jurisdiction: true,
        parcels: { orderBy: { createdAt: "asc" } },
        tasks: { orderBy: [{ pipelineStep: "asc" }, { createdAt: "asc" }] },
        artifacts: { orderBy: { createdAt: "desc" } },
        uploads: { orderBy: { createdAt: "desc" } },
        runs: {
          where: { runType: "TRIAGE" },
          orderBy: { startedAt: "desc" },
          take: 1,
          select: { outputJson: true, status: true, finishedAt: true },
        },
      },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    let triageTier: string | null = null;
    let triageOutput: Record<string, unknown> | null = null;
    const triageRun = deal.runs[0];
    if (triageRun?.outputJson && typeof triageRun.outputJson === "object") {
      const output = triageRun.outputJson as Record<string, unknown>;
      const triageCandidate =
        output.triage && typeof output.triage === "object"
          ? (output.triage as Record<string, unknown>)
          : output;
      const parsed = ParcelTriageSchema.safeParse({
        ...triageCandidate,
        generated_at: triageCandidate.generated_at ?? new Date().toISOString(),
        deal_id: triageCandidate.deal_id ?? id,
      });

      if (parsed.success) {
        triageOutput = parsed.data;
        triageTier = parsed.data.decision;
      }
    }

    return NextResponse.json({
      deal: {
        ...deal,
        triageTier,
        triageOutput,
        createdAt: deal.createdAt.toISOString(),
        updatedAt: deal.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error fetching deal:", error);
    return NextResponse.json(
      { error: "Failed to fetch deal" },
      { status: 500 }
    );
  }
}

// PATCH /api/deals/[id] - update a deal
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify org ownership before updating
    const existing = await prisma.deal.findFirst({
      where: { id, orgId: auth.orgId },
      select: { id: true, status: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const body = await request.json();

    const allowedFields = ["name", "status", "notes", "targetCloseDate", "sku", "jurisdictionId"];
    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        if (field === "targetCloseDate" && body[field]) {
          data[field] = new Date(body[field]);
        } else {
          data[field] = body[field];
        }
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No valid fields provided" },
        { status: 400 }
      );
    }

    const deal = await prisma.deal.update({
      where: { id },
      data,
      include: {
        jurisdiction: { select: { id: true, name: true } },
      },
    });

    // Dispatch deal.statusChanged event if status was updated
    if (data.status && data.status !== existing.status) {
      dispatchEvent({
        type: "deal.statusChanged",
        dealId: id,
        from: existing.status as import("@entitlement-os/shared").DealStatus,
        to: data.status as import("@entitlement-os/shared").DealStatus,
        orgId: auth.orgId,
      }).catch(() => {});
    }

    return NextResponse.json({ deal });
  } catch (error) {
    console.error("Error updating deal:", error);
    return NextResponse.json(
      { error: "Failed to update deal" },
      { status: 500 }
    );
  }
}

// DELETE /api/deals/[id] - delete a deal
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify org ownership before deleting
    const existing = await prisma.deal.findFirst({
      where: { id, orgId: auth.orgId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    await prisma.deal.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting deal:", error);
    return NextResponse.json(
      { error: "Failed to delete deal" },
      { status: 500 }
    );
  }
}
