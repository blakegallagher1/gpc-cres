import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { getDocumentProcessingService, type DocType } from "@/lib/services/documentProcessing.service";

// GET /api/deals/[id]/extractions/[extractionId] — get single extraction
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; extractionId: string }> }
) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, extractionId } = await params;

    const deal = await prisma.deal.findFirst({
      where: { id, orgId: auth.orgId },
      select: { id: true },
    });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const service = getDocumentProcessingService();
    const extraction = await service.getExtraction(extractionId, auth.orgId);

    if (!extraction || extraction.dealId !== id) {
      return NextResponse.json(
        { error: "Extraction not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ extraction });
  } catch (error) {
    console.error("Error fetching extraction:", error);
    return NextResponse.json(
      { error: "Failed to fetch extraction" },
      { status: 500 }
    );
  }
}

// PATCH /api/deals/[id]/extractions/[extractionId] — review/update extraction
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; extractionId: string }> }
) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, extractionId } = await params;

    const deal = await prisma.deal.findFirst({
      where: { id, orgId: auth.orgId },
      select: { id: true },
    });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const body = await request.json();
    const { extractedData, docType, reviewed } = body;

    const service = getDocumentProcessingService();

    if (reviewed === true) {
      const updated = await service.reviewExtraction(
        extractionId,
        auth.orgId,
        auth.userId,
        {
          extractedData: extractedData as Record<string, unknown> | undefined,
          docType: docType as DocType | undefined,
        }
      );
      return NextResponse.json({ extraction: updated });
    }

    // Just update data without marking reviewed
    if (extractedData || docType) {
      const extraction = await prisma.documentExtraction.findFirst({
        where: { id: extractionId, orgId: auth.orgId, dealId: id },
      });
      if (!extraction) {
        return NextResponse.json(
          { error: "Extraction not found" },
          { status: 404 }
        );
      }

      const updated = await prisma.documentExtraction.update({
        where: { id: extractionId },
        data: {
          ...(extractedData ? { extractedData } : {}),
          ...(docType ? { docType } : {}),
        },
      });
      return NextResponse.json({ extraction: updated });
    }

    return NextResponse.json(
      { error: "No updates provided" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error updating extraction:", error);
    return NextResponse.json(
      { error: "Failed to update extraction" },
      { status: 500 }
    );
  }
}
