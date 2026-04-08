import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  DealAccessError,
  getPropertySurveyForDeal,
  upsertPropertySurveyForDeal,
} from "@gpc/server";
import {
  PropertySurveyPatchInput,
  PropertySurveyPatchInputSchema,
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
    const { propertySurvey } = await getPropertySurveyForDeal({
      dealId: id,
      orgId: auth.orgId,
    });

    return NextResponse.json({ propertySurvey });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json(
        { error: error.status === 403 ? "Forbidden: deal does not belong to your org" : "Deal not found" },
        { status: error.status },
      );
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.property-survey", method: "GET" },
    });
    console.error("Error reading property survey:", error);
    return NextResponse.json(
      { error: "Failed to load property survey" },
      { status: 500 },
    );
  }
}

export async function PUT(
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
    const parsed = PropertySurveyPatchInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid property survey payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { propertySurvey } = await upsertPropertySurveyForDeal({
      dealId: id,
      orgId: auth.orgId,
      payload: parsed.data as PropertySurveyPatchInput,
    });

    return NextResponse.json({ propertySurvey });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json(
        { error: error.status === 403 ? "Forbidden: deal does not belong to your org" : "Deal not found" },
        { status: error.status },
      );
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.property-survey", method: "PUT" },
    });
    console.error("Error saving property survey:", error);
    return NextResponse.json(
      { error: "Failed to save property survey" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return PUT(request, { params });
}
