import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { resolveEntityId } from "@/lib/services/entityResolution";
import { memoryWriteGate } from "@/lib/services/memoryWriteGate";

// POST /api/memory/write — Submit free-text memory through the write gate
export async function POST(req: NextRequest) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { input_text, address, parcel_id, entity_id, entity_type } = body;

    if (!input_text || typeof input_text !== "string") {
      return NextResponse.json(
        { error: "input_text is required" },
        { status: 400 },
      );
    }

    if (!entity_id && !address && !parcel_id) {
      return NextResponse.json(
        { error: "At least one of entity_id, address, or parcel_id is required" },
        { status: 400 },
      );
    }

    // Resolve entity
    const resolvedEntityId = entity_id ?? await resolveEntityId({
      address,
      parcelId: parcel_id,
      type: entity_type,
      orgId: auth.orgId,
    });

    const result = await memoryWriteGate(input_text, {
      entityId: resolvedEntityId,
      orgId: auth.orgId,
      address: address ?? undefined,
      parcelId: parcel_id ?? undefined,
    });

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
