import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { AppError } from "@/lib/errors";
import { getDocumentProcessingService } from "@/lib/services/documentProcessing.service";
import { TriggerExtractionRequestSchema } from "@/lib/validation/extractionSchemas";

type ExtractionReviewStatus = "none" | "pending_review" | "review_complete";

function getExtractionStatus(
  totalCount: number,
  pendingCount: number
): ExtractionReviewStatus {
  if (totalCount === 0) return "none";
  if (pendingCount > 0) return "pending_review";
  return "review_complete";
}

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
    const totalCount = extractions.length;
    const pendingCount = Math.max(0, Math.min(unreviewedCount, totalCount));
    const reviewedCount = Math.max(0, totalCount - pendingCount);
    const extractionStatus = getExtractionStatus(totalCount, pendingCount);

    return NextResponse.json({
      extractions,
      unreviewedCount: pendingCount,
      pendingCount,
      reviewedCount,
      totalCount,
      extractionStatus,
    });
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
    const parsedBody = TriggerExtractionRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsedBody.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }
    const { uploadId } = parsedBody.data;

    // Verify upload belongs to this deal
    const upload = await prisma.upload.findFirst({
      where: { id: uploadId, dealId: id, orgId: auth.orgId },
    });
    if (!upload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }

    const service = getDocumentProcessingService();
    const result = await service.processUpload(uploadId, id, auth.orgId);

    return NextResponse.json(
      {
        success: true,
        idempotent: !result.created,
        extractionId: result.extractionId,
        docType: result.docType,
        extractedData: result.extractedData,
      },
      { status: result.created ? 201 : 200 }
    );
  } catch (error) {
    if (error instanceof AppError) {
      const statusCode =
        "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : "status" in error && typeof error.status === "number"
            ? error.status
            : undefined;

      if (statusCode === 400) {
        return NextResponse.json({ error: "Validation failed" }, { status: 400 });
      }
      if (statusCode === 404) {
        return NextResponse.json({ error: "Upload not found" }, { status: 404 });
      }
    }
    console.error("Error processing document:", error);
    return NextResponse.json(
      { error: "Failed to process document" },
      { status: 500 }
    );
  }
}
