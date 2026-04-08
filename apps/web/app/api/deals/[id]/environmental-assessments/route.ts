import { NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";

import {
  createEnvironmentalAssessmentForDeal,
  DealAccessError,
  deleteEnvironmentalAssessmentForDeal,
  EnvironmentalAssessmentNotFoundError,
  listEnvironmentalAssessmentsForDeal,
  updateEnvironmentalAssessmentForDeal,
} from "@gpc/server";
import {
  EnvironmentalAssessmentIdSchema,
  EnvironmentalAssessmentPatchInputSchema,
  EnvironmentalAssessmentPatchWithIdInputSchema,
} from "@entitlement-os/shared";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parseResult = paramsSchema.safeParse(await params);
  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid deal id" }, { status: 400 });
  }

  try {
    const { id } = parseResult.data;
    const environmentalAssessments = await listEnvironmentalAssessmentsForDeal({
      dealId: id,
      orgId: auth.orgId,
    });

    return NextResponse.json({ environmentalAssessments });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json(
        {
          error:
            error.status === 403
              ? "Forbidden: deal does not belong to your org"
              : "Deal not found",
        },
        { status: error.status },
      );
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.environmental-assessments", method: "GET" },
    });
    console.error("Error reading environmental assessments:", error);
    return NextResponse.json(
      { error: "Failed to load environmental assessments" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parseResult = paramsSchema.safeParse(await params);
  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid deal id" }, { status: 400 });
  }

  try {
    const { id } = parseResult.data;
    const body = await request.json();
    const parsed = EnvironmentalAssessmentPatchInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid environmental assessment payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const environmentalAssessment = await createEnvironmentalAssessmentForDeal({
      dealId: id,
      orgId: auth.orgId,
      input: parsed.data,
    });

    return NextResponse.json({ environmentalAssessment });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid environmental assessment payload", issues: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    if (error instanceof DealAccessError) {
      return NextResponse.json(
        {
          error:
            error.status === 403
              ? "Forbidden: deal does not belong to your org"
              : "Deal not found",
        },
        { status: error.status },
      );
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.environmental-assessments", method: "POST" },
    });
    console.error("Error creating environmental assessment:", error);
    return NextResponse.json(
      { error: "Failed to save environmental assessment" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parseResult = paramsSchema.safeParse(await params);
  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid deal id" }, { status: 400 });
  }

  try {
    const { id } = parseResult.data;
    const body = await request.json();
    const parsed = EnvironmentalAssessmentPatchWithIdInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid environmental assessment payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const environmentalAssessment = await updateEnvironmentalAssessmentForDeal({
      dealId: id,
      orgId: auth.orgId,
      input: parsed.data,
    });

    return NextResponse.json({ environmentalAssessment });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid environmental assessment payload", issues: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    if (error instanceof DealAccessError) {
      return NextResponse.json(
        {
          error:
            error.status === 403
              ? "Forbidden: deal does not belong to your org"
              : "Deal not found",
        },
        { status: error.status },
      );
    }
    if (error instanceof EnvironmentalAssessmentNotFoundError) {
      return NextResponse.json(
        { error: "Environmental assessment not found" },
        { status: 404 },
      );
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.environmental-assessments", method: "PATCH" },
    });
    console.error("Error updating environmental assessment:", error);
    return NextResponse.json(
      { error: "Failed to update environmental assessment" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parseResult = paramsSchema.safeParse(await params);
  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid deal id" }, { status: 400 });
  }

  try {
    const { id } = parseResult.data;
    const body = await request.json();
    const parsed = EnvironmentalAssessmentIdSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid environmental assessment id" }, { status: 400 });
    }

    const environmentalAssessment = await deleteEnvironmentalAssessmentForDeal({
      dealId: id,
      orgId: auth.orgId,
      environmentalAssessmentId: parsed.data.id,
    });

    return NextResponse.json({ environmentalAssessment });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid environmental assessment id", issues: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    if (error instanceof DealAccessError) {
      return NextResponse.json(
        {
          error:
            error.status === 403
              ? "Forbidden: deal does not belong to your org"
              : "Deal not found",
        },
        { status: error.status },
      );
    }
    if (error instanceof EnvironmentalAssessmentNotFoundError) {
      return NextResponse.json(
        { error: "Environmental assessment not found" },
        { status: 404 },
      );
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.environmental-assessments", method: "DELETE" },
    });
    console.error("Error deleting environmental assessment:", error);
    return NextResponse.json(
      { error: "Failed to delete environmental assessment" },
      { status: 500 },
    );
  }
}
