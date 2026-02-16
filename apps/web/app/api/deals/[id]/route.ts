import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { dispatchEvent } from "@/lib/automation/events";
import "@/lib/automation/handlers";
import { ParcelTriageSchema } from "@entitlement-os/shared";
import { captureAutomationDispatchError } from "@/lib/automation/sentry";
import * as Sentry from "@sentry/nextjs";

const PACK_STALE_DAYS = 7;
const PACK_COVERAGE_MINIMUM = 0.75;

function isJsonStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function daysSince(value: Date): number {
  return Math.floor((Date.now() - value.getTime()) / (24 * 60 * 60 * 1000));
}

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
        jurisdiction: { select: { id: true, name: true, kind: true, state: true } },
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

    const latestPack = deal.jurisdiction
      ? await prisma.parishPackVersion.findFirst({
          where: {
            jurisdictionId: deal.jurisdiction.id,
            sku: deal.sku,
            status: "current",
          },
          orderBy: { generatedAt: "desc" },
          select: {
            id: true,
            version: true,
            status: true,
            generatedAt: true,
            sourceEvidenceIds: true,
            sourceSnapshotIds: true,
            sourceContentHashes: true,
            sourceUrls: true,
            officialOnly: true,
            packCoverageScore: true,
            canonicalSchemaVersion: true,
            coverageSourceCount: true,
            inputHash: true,
          },
        })
      : null;

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

    const stalenessDays = latestPack ? daysSince(latestPack.generatedAt) : null;
    const packIsStale = stalenessDays === null ? false : stalenessDays >= PACK_STALE_DAYS;
    const missingEvidence: string[] = [];

    if (!latestPack) {
      missingEvidence.push("No current jurisdiction pack found for this deal SKU.");
    } else {
      if (!isJsonStringArray(latestPack.sourceEvidenceIds)) {
        missingEvidence.push("Pack lineage is missing sourceEvidenceIds.");
      }
      if (!isJsonStringArray(latestPack.sourceSnapshotIds)) {
        missingEvidence.push("Pack lineage is missing sourceSnapshotIds.");
      }
      if (!isJsonStringArray(latestPack.sourceContentHashes)) {
        missingEvidence.push("Pack lineage is missing sourceContentHashes.");
      }
      if (packIsStale) {
        missingEvidence.push("Pack is stale and should be refreshed.");
      }
      if (
        typeof latestPack.packCoverageScore === "number" &&
        latestPack.packCoverageScore < PACK_COVERAGE_MINIMUM
      ) {
        missingEvidence.push("Pack coverage score is below the required threshold.");
      }
    }

    return NextResponse.json({
      deal: {
        ...deal,
        triageTier,
        triageOutput,
        packContext: {
          hasPack: !!latestPack,
          isStale: packIsStale,
          stalenessDays,
          missingEvidence,
          latestPack: latestPack
            ? {
                id: latestPack.id,
                version: latestPack.version,
                status: latestPack.status,
                generatedAt: latestPack.generatedAt.toISOString(),
                sourceEvidenceIds: latestPack.sourceEvidenceIds,
                sourceSnapshotIds: latestPack.sourceSnapshotIds,
                sourceContentHashes: latestPack.sourceContentHashes,
                sourceUrls: latestPack.sourceUrls,
                officialOnly: latestPack.officialOnly,
                packCoverageScore: latestPack.packCoverageScore,
                canonicalSchemaVersion: latestPack.canonicalSchemaVersion,
                coverageSourceCount: latestPack.coverageSourceCount,
                inputHash: latestPack.inputHash,
              }
            : null,
        },
        createdAt: deal.createdAt.toISOString(),
        updatedAt: deal.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error fetching deal:", error);
    Sentry.captureException(error, {
      tags: { route: "/api/deals/[id]", method: "GET" },
      fingerprint: ["smoke-test", Date.now().toString()],
      level: "error",
    });
    await Sentry.flush(5000);
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
      }).catch((error) => {
        captureAutomationDispatchError(error, {
          handler: "api.deals.update",
          eventType: "deal.statusChanged",
          dealId: id,
          orgId: auth.orgId,
          status: String(data.status),
        });
      });
    }

    return NextResponse.json({ deal });
  } catch (error) {
    console.error("Error updating deal:", error);
    Sentry.captureException(error, {
      tags: { route: "/api/deals/[id]", method: "PATCH" },
      fingerprint: ["smoke-test", Date.now().toString()],
      level: "error",
    });
    await Sentry.flush(5000);
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
    Sentry.captureException(error, {
      tags: { route: "/api/deals/[id]", method: "DELETE" },
      fingerprint: ["smoke-test", Date.now().toString()],
      level: "error",
    });
    await Sentry.flush(5000);
    return NextResponse.json(
      { error: "Failed to delete deal" },
      { status: 500 }
    );
  }
}
