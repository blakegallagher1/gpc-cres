import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { z } from "zod";
import { dispatchEvent } from "@/lib/automation/events";
import "@/lib/automation/handlers";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { captureAutomationDispatchError } from "@/lib/automation/sentry";
import * as Sentry from "@sentry/nextjs";

const DealStatusSchema = z.enum([
  "INTAKE",
  "TRIAGE_DONE",
  "PREAPP",
  "CONCEPT",
  "NEIGHBORS",
  "SUBMITTED",
  "HEARING",
  "APPROVED",
  "EXIT_MARKETED",
  "EXITED",
  "KILLED",
]);

const DealBulkActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("delete"),
    ids: z.array(z.string().uuid()).min(1).max(250),
  }),
  z.object({
    action: z.literal("update-status"),
    ids: z.array(z.string().uuid()).min(1).max(250),
    status: DealStatusSchema,
  }),
]);

// GET /api/deals - list deals for the org
export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const sku = searchParams.get("sku");
    const jurisdictionId = searchParams.get("jurisdictionId");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = { orgId: auth.orgId };
    if (status) where.status = status;
    if (sku) where.sku = sku;
    if (jurisdictionId) where.jurisdictionId = jurisdictionId;
    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    const deals = await prisma.deal.findMany({
      where,
      include: {
        jurisdiction: { select: { id: true, name: true } },
        runs: {
          where: { runType: "TRIAGE" },
          orderBy: { startedAt: "desc" },
          take: 1,
          select: { outputJson: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = deals.map((d: typeof deals[number]) => {
      const triageRun = d.runs[0];
      let triageTier: string | null = null;
      let triageScore: number | null = null;
      if (triageRun?.outputJson && typeof triageRun.outputJson === "object") {
        const output = triageRun.outputJson as Record<string, unknown>;
        const triageCandidate =
          output.triage && typeof output.triage === "object"
            ? (output.triage as Record<string, unknown>)
            : output;
        triageTier =
          (output.tier as string) ?? (triageCandidate.decision as string) ?? null;
        triageScore =
          typeof output.triageScore === "number"
            ? output.triageScore
            : typeof output.confidence === "number"
              ? output.confidence
              : typeof triageCandidate.confidence === "number"
                ? triageCandidate.confidence
                : null;
      }
      return {
        id: d.id,
        name: d.name,
        sku: d.sku,
        status: d.status,
        jurisdiction: d.jurisdiction,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
        notes: d.notes,
        triageTier,
        triageScore,
      };
    });

    return NextResponse.json({ deals: result });
  } catch (error) {
    console.error("Error fetching deals:", error);
    Sentry.captureException(error, {
      tags: { route: "api.deals", method: "GET" },
    });
    return NextResponse.json(
      { error: "Failed to fetch deals" },
      { status: 500 }
    );
  }
}

// POST /api/deals - create a new deal
export async function POST(request: NextRequest) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    if (!body.name || !body.sku || !body.jurisdictionId) {
      return NextResponse.json(
        { error: "name, sku, and jurisdictionId are required" },
        { status: 400 }
      );
    }

    // Validate sku
    const validSkus = ["SMALL_BAY_FLEX", "OUTDOOR_STORAGE", "TRUCK_PARKING"];
    if (!validSkus.includes(body.sku)) {
      return NextResponse.json(
        { error: `Invalid SKU. Must be one of: ${validSkus.join(", ")}` },
        { status: 400 }
      );
    }

    const deal = await prisma.deal.create({
      data: {
        orgId: auth.orgId,
        name: body.name,
        sku: body.sku,
        jurisdictionId: body.jurisdictionId,
        status: "INTAKE",
        notes: body.notes ?? null,
        targetCloseDate: body.targetCloseDate ? new Date(body.targetCloseDate) : null,
        createdBy: auth.userId,
      },
      include: {
        jurisdiction: { select: { id: true, name: true } },
      },
    });

    // If a parcel address was provided, create the first parcel
    if (body.parcelAddress) {
      await prisma.parcel.create({
        data: {
          orgId: auth.orgId,
          dealId: deal.id,
          address: body.parcelAddress,
          apn: body.apn ?? null,
        },
      });
    }

    return NextResponse.json({ deal }, { status: 201 });
  } catch (error) {
    console.error("Error creating deal:", error);
    Sentry.captureException(error, {
      tags: { route: "api.deals", method: "POST" },
    });
    return NextResponse.json(
      { error: "Failed to create deal" },
      { status: 500 }
    );
  }
}

// PATCH /api/deals — bulk actions for list of deals
export async function PATCH(request: NextRequest) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = DealBulkActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; "),
        },
        { status: 400 }
      );
    }

    const ids = [...new Set(parsed.data.ids)];
    if (ids.length === 0) {
      return NextResponse.json(
        { error: "No valid deal IDs provided" },
        { status: 400 }
      );
    }

    const deals = await prisma.deal.findMany({
      where: { orgId: auth.orgId, id: { in: ids } },
      select: { id: true, status: true },
    });

    const scopedIds = deals.map((deal) => deal.id);
    if (scopedIds.length === 0) {
      return NextResponse.json({ action: parsed.data.action, updated: 0, skipped: ids.length }, { status: 200 });
    }

    if (parsed.data.action === "delete") {
      const result = await prisma.deal.deleteMany({
        where: { id: { in: scopedIds } },
      });

      return NextResponse.json({
        action: "delete",
        updated: result.count,
        skipped: ids.length - result.count,
        ids: scopedIds,
      });
    }

    const result = await prisma.deal.updateMany({
      where: { id: { in: scopedIds } },
      data: { status: parsed.data.status },
    });

    const targetStatus = parsed.data.status;
    for (const deal of deals) {
      if (deal.status !== parsed.data.status) {
        dispatchEvent({
          type: "deal.statusChanged",
          dealId: deal.id,
          from: deal.status as import("@entitlement-os/shared").DealStatus,
          to: targetStatus as import("@entitlement-os/shared").DealStatus,
          orgId: auth.orgId,
        }).catch((error) => {
          captureAutomationDispatchError(error, {
            handler: "api.deals.bulk-update-status",
            eventType: "deal.statusChanged",
            dealId: deal.id,
            orgId: auth.orgId,
            status: targetStatus,
          });
        });
      }
    }

    return NextResponse.json({
      action: "update-status",
      status: parsed.data.status,
      updated: result.count,
      skipped: ids.length - result.count,
      ids: scopedIds,
    });
  } catch (error) {
    console.error("Error bulk updating deals:", error);
    Sentry.captureException(error, {
      tags: { route: "api.deals", method: "PATCH" },
    });
    return NextResponse.json(
      { error: "Failed to bulk update deals" },
      { status: 500 }
    );
  }
}
