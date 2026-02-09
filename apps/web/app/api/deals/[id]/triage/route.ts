import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { createStrictJsonResponse } from "@entitlement-os/openai";
import {
  ParcelTriageSchema,
  zodToOpenAiJsonSchema,
} from "@entitlement-os/shared";
import type { ParcelTriage } from "@entitlement-os/shared";

/** Recursively strip `format` keys from a JSON schema object (OpenAI rejects them). */
function stripFormat(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(stripFormat);
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (k === "format") continue;
      out[k] = stripFormat(v);
    }
    return out;
  }
  return obj;
}

// POST /api/deals/[id]/triage - run triage
export async function POST(
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
      },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    if (deal.parcels.length === 0) {
      return NextResponse.json(
        { error: "Deal must have at least one parcel to run triage" },
        { status: 400 }
      );
    }

    // Create run record
    const run = await prisma.run.create({
      data: {
        orgId: auth.orgId,
        dealId: id,
        runType: "TRIAGE",
        status: "running",
      },
    });

    try {
      // Build parcel context
      const parcelDescriptions = deal.parcels
        .map((p, i) => {
          const parts = [`Parcel ${i + 1}: ${p.address}`];
          if (p.apn) parts.push(`APN: ${p.apn}`);
          if (p.acreage) parts.push(`Acreage: ${p.acreage}`);
          if (p.currentZoning) parts.push(`Zoning: ${p.currentZoning}`);
          if (p.floodZone) parts.push(`Flood Zone: ${p.floodZone}`);
          if (p.soilsNotes) parts.push(`Soils: ${p.soilsNotes}`);
          if (p.wetlandsNotes) parts.push(`Wetlands: ${p.wetlandsNotes}`);
          if (p.envNotes) parts.push(`Environmental: ${p.envNotes}`);
          if (p.trafficNotes) parts.push(`Traffic: ${p.trafficNotes}`);
          if (p.utilitiesNotes) parts.push(`Utilities: ${p.utilitiesNotes}`);
          return parts.join("\n  ");
        })
        .join("\n\n");

      const systemPrompt = `You are a commercial real estate deal screener for Gallagher Property Company, specializing in light industrial, outdoor storage, and truck parking in Louisiana. Evaluate the following deal and produce a structured triage assessment. Use web search to verify current conditions, recent permits, environmental issues, and market data. Be thorough but decisive.`;

      const userPrompt = `Triage this deal:

Deal: ${deal.name}
SKU: ${deal.sku}
Jurisdiction: ${deal.jurisdiction?.name ?? "Unknown"}
Deal ID: ${deal.id}

${parcelDescriptions}

Evaluate all risk dimensions (access, drainage, adjacency, environmental, utilities, politics) on a 0-10 scale where 10 is highest risk. Identify any hard or soft disqualifiers. Recommend KILL, HOLD, or ADVANCE with a clear rationale and next actions.`;

      // Generate schema and strip format constraints
      const rawSchema = zodToOpenAiJsonSchema("ParcelTriage", ParcelTriageSchema);
      const cleanSchema = {
        ...rawSchema,
        schema: stripFormat(rawSchema.schema) as Record<string, unknown>,
      };

      const result = await createStrictJsonResponse<ParcelTriage>({
        model: process.env.OPENAI_FLAGSHIP_MODEL || "gpt-5.2",
        input: [
          { role: "system" as const, content: systemPrompt },
          { role: "user" as const, content: userPrompt },
        ],
        jsonSchema: cleanSchema,
        tools: [{ type: "web_search_preview" as const, search_context_size: "high" as const }],
      });

      // Update run as succeeded
      await prisma.run.update({
        where: { id: run.id },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
          outputJson: JSON.parse(JSON.stringify(result.outputJson)),
          openaiResponseId: result.responseId,
        },
      });

      // Advance deal status if currently INTAKE
      if (deal.status === "INTAKE") {
        await prisma.deal.update({
          where: { id },
          data: { status: "TRIAGE_DONE" },
        });
      }

      return NextResponse.json({
        run: { id: run.id, status: "succeeded" },
        triage: result.outputJson,
        sources: result.toolSources.webSearchSources,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await prisma.run.update({
        where: { id: run.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          error: errorMsg,
        },
      });

      console.error("Triage failed:", error);
      return NextResponse.json(
        { error: "Triage failed", detail: errorMsg },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error running triage:", error);
    return NextResponse.json(
      { error: "Failed to run triage" },
      { status: 500 }
    );
  }
}

// GET /api/deals/[id]/triage - get latest triage result
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
      select: { id: true },
    });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const run = await prisma.run.findFirst({
      where: { dealId: id, orgId: auth.orgId, runType: "TRIAGE" },
      orderBy: { startedAt: "desc" },
    });

    if (!run) {
      return NextResponse.json({ run: null, triage: null });
    }

    return NextResponse.json({
      run: {
        id: run.id,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
      },
      triage: run.outputJson,
    });
  } catch (error) {
    console.error("Error fetching triage:", error);
    return NextResponse.json(
      { error: "Failed to fetch triage" },
      { status: 500 }
    );
  }
}
