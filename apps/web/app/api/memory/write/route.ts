import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { resolveEntityId } from "@/lib/services/entityResolution";
import { memoryWriteGate } from "@/lib/services/memoryWriteGate";
import { ingestKnowledge } from "@/lib/services/knowledgeBase.service";
import { bridgeCompToMarket } from "@/lib/services/compToMarket";

const ADDRESS_WITH_CITY_STATE_ZIP_RE =
  /\b\d{1,6}\s+[A-Za-z0-9.'\- ]+?\s(?:Street|St\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Road|Rd\.?|Drive|Dr\.?|Lane|Ln\.?|Court|Ct\.?|Place|Pl\.?|Parkway|Pkwy\.?|Highway|Hwy\.?|Trail|Trl\.?|Way|Terrace|Terr\.?|Circle|Cir\.?)\s*,\s*[A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}\b/i;

function extractAddressFromInputText(inputText: string): string | null {
  const match = inputText.match(ADDRESS_WITH_CITY_STATE_ZIP_RE);
  if (!match) return null;
  const candidate = match[0].trim();
  return candidate.length > 0 ? candidate : null;
}

// POST /api/memory/write — Submit free-text memory through the write gate
export async function POST(req: NextRequest) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { input_text, address, parcel_id, entity_id, entity_type } = body;
    const normalizedAddress =
      typeof address === "string" && address.trim().length > 0
        ? address.trim()
        : null;
    const inferredAddress =
      typeof input_text === "string" && !normalizedAddress
        ? extractAddressFromInputText(input_text)
        : null;
    const effectiveAddress = normalizedAddress ?? inferredAddress;

    if (!input_text || typeof input_text !== "string") {
      return NextResponse.json(
        { error: "input_text is required" },
        { status: 400 },
      );
    }

    if (!entity_id && !effectiveAddress && !parcel_id) {
      return NextResponse.json(
        { error: "At least one of entity_id, address, or parcel_id is required" },
        { status: 400 },
      );
    }

    // Prefer deterministic entity resolution from address/parcel inputs when available.
    // This avoids hallucinated/stale entity IDs bypassing conflict checks.
    const shouldResolveByLocation = Boolean(effectiveAddress || parcel_id);
    const resolvedEntityId = shouldResolveByLocation
      ? await resolveEntityId({
          address: effectiveAddress,
          parcelId: parcel_id,
          type: entity_type,
          orgId: auth.orgId,
        })
      : entity_id;

    const result = await memoryWriteGate(input_text, {
      entityId: resolvedEntityId,
      orgId: auth.orgId,
      address: effectiveAddress ?? undefined,
      parcelId: parcel_id ?? undefined,
    });

    // Auto-embed verified facts into semantic knowledge base for future recall
    if (result.decision === "verified" && result.recordId && result.structuredMemoryWrite) {
      const factType = result.structuredMemoryWrite.fact_type;
      const contentText = `${factType}: ${JSON.stringify(result.structuredMemoryWrite)}`;
      ingestKnowledge(auth.orgId, "agent_analysis", result.recordId, contentText, {
        entityId: resolvedEntityId ?? undefined,
        factType,
        orgId: auth.orgId,
      }).catch(() => {});

      // Bridge verified comps to Market Intel page (MarketDataPoint table)
      bridgeCompToMarket(result.structuredMemoryWrite, effectiveAddress);
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Error in memory write gate:", error);
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    return NextResponse.json(
      { error: "Failed to process memory write", detail: message, stack: process.env.NODE_ENV === "development" ? stack : undefined },
      { status: 500 },
    );
  }
}
