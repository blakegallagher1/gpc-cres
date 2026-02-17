import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import type { Prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { AppError } from "@/lib/errors";
import { getDocumentProcessingService } from "@/lib/services/documentProcessing.service";
import {
  DocTypeSchema,
  PatchExtractionRequestSchema,
  type DocType,
  validateExtractionPayload,
} from "@/lib/validation/extractionSchemas";

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
    const parsedBody = PatchExtractionRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsedBody.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { extractedData, docType, reviewed } = parsedBody.data;

    const service = getDocumentProcessingService();

    if (reviewed === true) {
      const updated = await service.reviewExtraction(extractionId, auth.orgId, auth.userId, {
        dealId: id,
        extractedData,
        docType: docType as DocType | undefined,
      });
      return NextResponse.json({ extraction: updated });
    }

    // Just update data without marking reviewed
    if (extractedData !== undefined || docType !== undefined) {
      const extraction = await prisma.documentExtraction.findFirst({
        where: { id: extractionId, orgId: auth.orgId, dealId: id },
      });
      if (!extraction) {
        return NextResponse.json(
          { error: "Extraction not found" },
          { status: 404 }
        );
      }

      const docTypeResult = DocTypeSchema.safeParse(docType ?? extraction.docType);
      if (!docTypeResult.success) {
        return NextResponse.json(
          { error: "Validation failed", details: { docType: ["Invalid document type"] } },
          { status: 400 }
        );
      }
      const targetDocType: DocType = docTypeResult.data;
      const normalizedData =
        extractedData !== undefined ? extractedData : extraction.extractedData;
      const validated = validateExtractionPayload(targetDocType, normalizedData);
      if (!validated.success) {
        return NextResponse.json(
          {
            error: "Validation failed",
            details: { extractedData: validated.issues },
          },
          { status: 400 }
        );
      }

      const updateResult = await prisma.documentExtraction.updateMany({
        where: { id: extractionId, orgId: auth.orgId, dealId: id },
        data: {
          ...(extractedData !== undefined
            ? { extractedData: validated.data as Prisma.InputJsonValue }
            : {}),
          ...(docType !== undefined ? { docType: targetDocType } : {}),
        },
      });
      if (updateResult.count === 0) {
        return NextResponse.json(
          { error: "Extraction not found" },
          { status: 404 }
        );
      }

      const updated = await service.getExtraction(extractionId, auth.orgId);
      if (!updated || updated.dealId !== id) {
        return NextResponse.json(
          { error: "Extraction not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({ extraction: updated });
    }

    return NextResponse.json(
      { error: "No updates provided" },
      { status: 400 }
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
        return NextResponse.json({ error: "Extraction not found" }, { status: 404 });
      }
    }
    console.error("Error updating extraction:", error);
    return NextResponse.json(
      { error: "Failed to update extraction" },
      { status: 500 }
    );
  }
}
