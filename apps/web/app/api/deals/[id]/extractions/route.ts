import { NextRequest, NextResponse } from "next/server";
import {
  DealAccessError,
  DealUploadNotFoundError,
  getExtractionsSummaryForDeal,
  triggerExtractionForDeal,
} from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { AppError } from "@/lib/errors";
import { TriggerExtractionRequestSchema } from "@/lib/validation/extractionSchemas";
import * as Sentry from "@sentry/nextjs";

// GET /api/deals/[id]/extractions — list all document extractions for a deal
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const summary = await getExtractionsSummaryForDeal({
      dealId: id,
      orgId: auth.orgId,
    });

    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.extractions", method: "GET" },
    });
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
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

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
    const result = await triggerExtractionForDeal({
      dealId: id,
      orgId: auth.orgId,
      uploadId,
    });

    return NextResponse.json(
      {
        success: true,
        idempotent: result.idempotent,
        extractionId: result.extractionId,
        docType: result.docType,
        extractedData: result.extractedData,
      },
      { status: result.created ? 201 : 200 }
    );
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals.extractions", method: "POST" },
    });
    if (error instanceof DealAccessError) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }
    if (error instanceof DealUploadNotFoundError) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
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
