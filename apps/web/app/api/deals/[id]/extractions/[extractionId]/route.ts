import { NextRequest, NextResponse } from "next/server";
import {
  DealAccessError,
  DealExtractionNotFoundError,
  DealExtractionValidationError,
  getExtractionForDeal,
  reviewExtractionForDeal,
  updateExtractionForDeal,
} from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { AppError } from "@/lib/errors";
import * as Sentry from "@sentry/nextjs";
import {
  PatchExtractionRequestSchema,
} from "@/lib/validation/extractionSchemas";

// GET /api/deals/[id]/extractions/[extractionId] — get single extraction
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; extractionId: string }> }
) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, extractionId } = await params;
    const extraction = await getExtractionForDeal({
      dealId: id,
      extractionId,
      orgId: auth.orgId,
    });

    return NextResponse.json({ extraction });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }
    if (error instanceof DealExtractionNotFoundError) {
      return NextResponse.json({ error: "Extraction not found" }, { status: 404 });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.extractions", method: "GET" },
    });
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
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, extractionId } = await params;

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

    if (reviewed === true) {
      const updated = await reviewExtractionForDeal({
        extractionId,
        orgId: auth.orgId,
        userId: auth.userId,
        dealId: id,
        extractedData,
        docType,
      });
      return NextResponse.json({ extraction: updated });
    }

    // Just update data without marking reviewed
    if (extractedData !== undefined || docType !== undefined) {
      const updated = await updateExtractionForDeal({
        extractionId,
        orgId: auth.orgId,
        dealId: id,
        extractedData,
        docType,
      });

      return NextResponse.json({ extraction: updated });
    }

    return NextResponse.json(
      { error: "No updates provided" },
      { status: 400 }
    );
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals.extractions", method: "PATCH" },
    });
    if (error instanceof DealAccessError) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }
    if (error instanceof DealExtractionNotFoundError) {
      return NextResponse.json({ error: "Extraction not found" }, { status: 404 });
    }
    if (error instanceof DealExtractionValidationError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: 400 },
      );
    }
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
