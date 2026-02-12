import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  getEntitlementFeaturePrimitives,
  getEntitlementGraph,
  getEntitlementIntelligenceKpis,
  predictEntitlementStrategies,
  upsertEntitlementGraphEdge,
  upsertEntitlementGraphNode,
  upsertEntitlementOutcomePrecedent,
} from "@/lib/services/entitlementIntelligence.service";
import { recommendEntitlementStrategy } from "@/lib/services/entitlementStrategyAutopilot.service";

const skuSchema = z.enum(["SMALL_BAY_FLEX", "OUTDOOR_STORAGE", "TRUCK_PARKING"]);
const optionalBooleanParam = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return value;
}, z.boolean().optional());

const getQuerySchema = z.object({
  view: z.enum(["graph", "predict", "features", "kpi", "recommend"]).default("predict"),
  jurisdictionId: z.string().uuid(),
  dealId: z.string().uuid().optional(),
  sku: skuSchema.optional(),
  applicationType: z.string().min(1).optional(),
  hearingBody: z.string().min(1).optional(),
  strategyKeys: z.string().optional(),
  lookbackMonths: z.coerce.number().int().min(1).max(240).optional(),
  snapshotLookbackMonths: z.coerce.number().int().min(1).max(360).optional(),
  minSampleSize: z.coerce.number().int().min(1).max(100).optional(),
  recordLimit: z.coerce.number().int().min(1).max(5000).optional(),
  includeBelowMinSample: optionalBooleanParam,
  includeInactive: optionalBooleanParam,
  nodeTypes: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  persistSnapshots: optionalBooleanParam,
});

const postBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("upsert_node"),
    jurisdictionId: z.string().uuid(),
    dealId: z.string().uuid().nullable().optional(),
    nodeType: z.string().min(1),
    nodeKey: z.string().min(1),
    label: z.string().min(1),
    attributes: z.record(z.string(), z.unknown()).optional(),
    confidence: z.number().min(0).max(1).nullable().optional(),
    active: z.boolean().nullable().optional(),
  }),
  z.object({
    action: z.literal("upsert_edge"),
    jurisdictionId: z.string().uuid(),
    fromNodeId: z.string().uuid(),
    toNodeId: z.string().uuid(),
    edgeType: z.string().min(1),
    weight: z.number().positive().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    action: z.literal("upsert_precedent"),
    jurisdictionId: z.string().uuid(),
    dealId: z.string().uuid().nullable().optional(),
    strategyNodeId: z.string().uuid().nullable().optional(),
    precedentKey: z.string().min(1),
    strategyKey: z.string().min(1),
    strategyLabel: z.string().min(1),
    sku: skuSchema.nullable().optional(),
    applicationType: z.string().nullable().optional(),
    hearingBody: z.string().nullable().optional(),
    submittedAt: z.string().nullable().optional(),
    decisionAt: z.string().nullable().optional(),
    decision: z.enum([
      "approved",
      "approved_with_conditions",
      "denied",
      "withdrawn",
    ]),
    timelineDays: z.number().int().positive().nullable().optional(),
    conditions: z.array(z.unknown()).optional(),
    riskFlags: z.array(z.string()).optional(),
    sourceEvidenceIds: z.array(z.string()).optional(),
    sourceSnapshotIds: z.array(z.string()).optional(),
    confidence: z.number().min(0).max(1).nullable().optional(),
    notes: z.string().nullable().optional(),
  }),
  z.object({
    action: z.literal("predict"),
    jurisdictionId: z.string().uuid(),
    dealId: z.string().uuid().nullable().optional(),
    sku: skuSchema.nullable().optional(),
    applicationType: z.string().nullable().optional(),
    lookbackMonths: z.number().int().min(1).max(240).nullable().optional(),
    minSampleSize: z.number().int().min(1).max(100).nullable().optional(),
    includeBelowMinSample: z.boolean().nullable().optional(),
    persistSnapshots: z.boolean().nullable().optional(),
    modelVersion: z.string().nullable().optional(),
  }),
]);

export async function GET(req: NextRequest) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = getQuerySchema.safeParse({
    view: searchParams.get("view") ?? undefined,
    jurisdictionId: searchParams.get("jurisdictionId") ?? undefined,
    dealId: searchParams.get("dealId") ?? undefined,
    sku: searchParams.get("sku") ?? undefined,
    applicationType: searchParams.get("applicationType") ?? undefined,
    hearingBody: searchParams.get("hearingBody") ?? undefined,
    strategyKeys: searchParams.get("strategyKeys") ?? undefined,
    lookbackMonths: searchParams.get("lookbackMonths") ?? undefined,
    snapshotLookbackMonths: searchParams.get("snapshotLookbackMonths") ?? undefined,
    minSampleSize: searchParams.get("minSampleSize") ?? undefined,
    recordLimit: searchParams.get("recordLimit") ?? undefined,
    includeBelowMinSample: searchParams.get("includeBelowMinSample") ?? undefined,
    includeInactive: searchParams.get("includeInactive") ?? undefined,
    nodeTypes: searchParams.get("nodeTypes") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    persistSnapshots: searchParams.get("persistSnapshots") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.view === "graph") {
      const nodeTypes = parsed.data.nodeTypes
        ? parsed.data.nodeTypes
            .split(",")
            .map((value) => value.trim())
            .filter((value) => value.length > 0)
        : null;

      const graph = await getEntitlementGraph({
        orgId: auth.orgId,
        jurisdictionId: parsed.data.jurisdictionId,
        includeInactive: parsed.data.includeInactive ?? false,
        nodeTypes,
        limit: parsed.data.limit ?? 250,
      });
      return NextResponse.json(graph);
    }

    if (parsed.data.view === "features") {
      const strategyKeys = parsed.data.strategyKeys
        ? parsed.data.strategyKeys
            .split(",")
            .map((value) => value.trim())
            .filter((value) => value.length > 0)
        : null;

      const features = await getEntitlementFeaturePrimitives({
        orgId: auth.orgId,
        jurisdictionId: parsed.data.jurisdictionId,
        dealId: parsed.data.dealId ?? null,
        sku: parsed.data.sku ?? null,
        applicationType: parsed.data.applicationType ?? null,
        hearingBody: parsed.data.hearingBody ?? null,
        strategyKeys,
        lookbackMonths: parsed.data.lookbackMonths ?? 36,
        minSampleSize: parsed.data.minSampleSize ?? 3,
        recordLimit: parsed.data.recordLimit ?? 1000,
      });
      return NextResponse.json(features);
    }

    if (parsed.data.view === "kpi") {
      const strategyKeys = parsed.data.strategyKeys
        ? parsed.data.strategyKeys
            .split(",")
            .map((value) => value.trim())
            .filter((value) => value.length > 0)
        : null;

      const kpis = await getEntitlementIntelligenceKpis({
        orgId: auth.orgId,
        jurisdictionId: parsed.data.jurisdictionId,
        dealId: parsed.data.dealId ?? null,
        sku: parsed.data.sku ?? null,
        applicationType: parsed.data.applicationType ?? null,
        hearingBody: parsed.data.hearingBody ?? null,
        strategyKeys,
        lookbackMonths: parsed.data.lookbackMonths ?? 36,
        snapshotLookbackMonths: parsed.data.snapshotLookbackMonths ?? null,
        minSampleSize: parsed.data.minSampleSize ?? 1,
        recordLimit: parsed.data.recordLimit ?? 1000,
      });
      return NextResponse.json(kpis);
    }

    if (parsed.data.view === "recommend") {
      if (!parsed.data.dealId) {
        return NextResponse.json(
          { error: "dealId is required for view=recommend" },
          { status: 400 },
        );
      }

      const recommendation = await recommendEntitlementStrategy({
        orgId: auth.orgId,
        jurisdictionId: parsed.data.jurisdictionId,
        dealId: parsed.data.dealId,
        lookbackMonths: parsed.data.lookbackMonths ?? null,
        snapshotLookbackMonths: parsed.data.snapshotLookbackMonths ?? null,
        recordLimit: parsed.data.recordLimit ?? null,
        persistSnapshots: parsed.data.persistSnapshots ?? true,
      });
      return NextResponse.json(recommendation);
    }

    const prediction = await predictEntitlementStrategies({
      orgId: auth.orgId,
      jurisdictionId: parsed.data.jurisdictionId,
      dealId: parsed.data.dealId ?? null,
      sku: parsed.data.sku ?? null,
      applicationType: parsed.data.applicationType ?? null,
      lookbackMonths: parsed.data.lookbackMonths ?? 36,
      minSampleSize: parsed.data.minSampleSize ?? 1,
      includeBelowMinSample: parsed.data.includeBelowMinSample ?? true,
      persistSnapshots: parsed.data.persistSnapshots ?? true,
      modelVersion: null,
    });
    return NextResponse.json(prediction);
  } catch (error) {
    console.error("Entitlement intelligence GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to query entitlement intelligence" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    switch (parsed.data.action) {
      case "upsert_node": {
        const node = await upsertEntitlementGraphNode({
          orgId: auth.orgId,
          jurisdictionId: parsed.data.jurisdictionId,
          dealId: parsed.data.dealId ?? null,
          nodeType: parsed.data.nodeType,
          nodeKey: parsed.data.nodeKey,
          label: parsed.data.label,
          attributes: parsed.data.attributes ?? {},
          confidence: parsed.data.confidence ?? null,
          active: parsed.data.active ?? null,
        });
        return NextResponse.json({ node }, { status: 201 });
      }
      case "upsert_edge": {
        const edge = await upsertEntitlementGraphEdge({
          orgId: auth.orgId,
          jurisdictionId: parsed.data.jurisdictionId,
          fromNodeId: parsed.data.fromNodeId,
          toNodeId: parsed.data.toNodeId,
          edgeType: parsed.data.edgeType,
          weight: parsed.data.weight ?? null,
          metadata: parsed.data.metadata ?? {},
        });
        return NextResponse.json({ edge }, { status: 201 });
      }
      case "upsert_precedent": {
        const precedent = await upsertEntitlementOutcomePrecedent({
          orgId: auth.orgId,
          jurisdictionId: parsed.data.jurisdictionId,
          dealId: parsed.data.dealId ?? null,
          strategyNodeId: parsed.data.strategyNodeId ?? null,
          precedentKey: parsed.data.precedentKey,
          strategyKey: parsed.data.strategyKey,
          strategyLabel: parsed.data.strategyLabel,
          sku: parsed.data.sku ?? null,
          applicationType: parsed.data.applicationType ?? null,
          hearingBody: parsed.data.hearingBody ?? null,
          submittedAt: parsed.data.submittedAt ?? null,
          decisionAt: parsed.data.decisionAt ?? null,
          decision: parsed.data.decision,
          timelineDays: parsed.data.timelineDays ?? null,
          conditions: parsed.data.conditions ?? [],
          riskFlags: parsed.data.riskFlags ?? [],
          sourceEvidenceIds: parsed.data.sourceEvidenceIds ?? [],
          sourceSnapshotIds: parsed.data.sourceSnapshotIds ?? [],
          confidence: parsed.data.confidence ?? null,
          notes: parsed.data.notes ?? null,
          createdBy: auth.userId,
        });
        return NextResponse.json({ precedent }, { status: 201 });
      }
      case "predict": {
        const prediction = await predictEntitlementStrategies({
          orgId: auth.orgId,
          jurisdictionId: parsed.data.jurisdictionId,
          dealId: parsed.data.dealId ?? null,
          sku: parsed.data.sku ?? null,
          applicationType: parsed.data.applicationType ?? null,
          lookbackMonths: parsed.data.lookbackMonths ?? 36,
          minSampleSize: parsed.data.minSampleSize ?? 1,
          includeBelowMinSample: parsed.data.includeBelowMinSample ?? true,
          persistSnapshots: parsed.data.persistSnapshots ?? true,
          modelVersion: parsed.data.modelVersion ?? null,
        });
        return NextResponse.json(prediction);
      }
      default: {
        return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
      }
    }
  } catch (error) {
    console.error("Entitlement intelligence POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process entitlement intelligence request" },
      { status: 500 },
    );
  }
}
