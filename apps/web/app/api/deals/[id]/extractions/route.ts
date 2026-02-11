import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { getDocumentProcessingService } from "@/lib/services/documentProcessing.service";

// GET /api/deals/[id]/extractions — list all document extractions for a deal
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

    const service = getDocumentProcessingService();
    const extractions = await service.getExtractionsByDeal(id, auth.orgId);
    const unreviewedCount = await service.getUnreviewedCount(id, auth.orgId);

    return NextResponse.json({ extractions, unreviewedCount });
  } catch (error) {
    console.error("Error fetching extractions:", error);
    return NextResponse.json(
      { error: "Failed to fetch extractions" },
      { status: 500 }
    );
  }
}

// POST /api/deals/[id]/extractions — manually trigger processing for an upload
export async function POST(
  request: NextRequest,
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

    const body = await request.json();
    const { uploadId } = body;

    if (!uploadId || typeof uploadId !== "string") {
      return NextResponse.json(
        { error: "uploadId is required" },
        { status: 400 }
      );
    }

    // Verify upload belongs to this deal
    const upload = await prisma.upload.findFirst({
      where: { id: uploadId, dealId: id, orgId: auth.orgId },
    });
    if (!upload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }

    const service = getDocumentProcessingService();
    await service.processUpload(uploadId, id, auth.orgId);

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Error processing document:", error);
    return NextResponse.json(
      { error: "Failed to process document" },
      { status: 500 }
    );
  }
}
