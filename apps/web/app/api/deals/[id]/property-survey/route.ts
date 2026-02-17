import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@entitlement-os/db";
import {
  PropertySurveyPatchInput,
  PropertySurveyPatchInputSchema,
} from "@entitlement-os/shared";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

type DateOrString = Date | string | null | undefined;
type DecimalLike = { toString: () => string };
type Setbacks = Record<string, unknown>;

type PropertySurveyRecord = {
  id: string;
  orgId: string;
  dealId: string;
  surveyCompletedDate: DateOrString;
  acreageConfirmed: DecimalLike | number | null;
  encroachments: string[];
  setbacks: Setbacks;
  createdAt: DateOrString;
  updatedAt: DateOrString;
};

type PropertySurveyResponse = {
  id: string;
  orgId: string;
  dealId: string;
  surveyCompletedDate: string | null;
  acreageConfirmed: string | null;
  encroachments: string[];
  setbacks: Setbacks;
  createdAt: string | null;
  updatedAt: string | null;
};

function valueToIsoString(value: DateOrString): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  return value.toISOString();
}

function valueToString(value: DecimalLike | number | null): string | null {
  if (value === null) {
    return null;
  }
  return value.toString();
}

function serializePropertySurvey(propertySurvey: PropertySurveyRecord): PropertySurveyResponse {
  return {
    id: propertySurvey.id,
    orgId: propertySurvey.orgId,
    dealId: propertySurvey.dealId,
    surveyCompletedDate: valueToIsoString(propertySurvey.surveyCompletedDate),
    acreageConfirmed: valueToString(propertySurvey.acreageConfirmed),
    encroachments: propertySurvey.encroachments,
    setbacks: propertySurvey.setbacks,
    createdAt: valueToIsoString(propertySurvey.createdAt),
    updatedAt: valueToIsoString(propertySurvey.updatedAt),
  };
}

function toPropertySurveyPayload(input: PropertySurveyPatchInput) {
  const payload: Record<string, unknown> = {};

  if (input.surveyCompletedDate !== undefined) {
    payload.surveyCompletedDate = input.surveyCompletedDate;
  }
  if (input.acreageConfirmed !== undefined) {
    payload.acreageConfirmed = input.acreageConfirmed;
  }
  if (input.encroachments !== undefined) {
    payload.encroachments = input.encroachments;
  }
  if (input.setbacks !== undefined) {
    payload.setbacks = input.setbacks;
  }

  return payload;
}

async function authorizeDeal(
  id: string,
  orgId: string,
): Promise<{ ok: true; dealId: string } | { ok: false; status: 403 | 404 }> {
  const deal = await prisma.deal.findUnique({
    where: { id },
    select: { id: true, orgId: true },
  });

  if (!deal) {
    return { ok: false, status: 404 };
  }
  if (deal.orgId !== orgId) {
    return { ok: false, status: 403 };
  }

  return { ok: true, dealId: deal.id };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parseResult = paramsSchema.safeParse(await params);
  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid deal id" }, { status: 400 });
  }

  try {
    const { id } = parseResult.data;
    const authorized = await authorizeDeal(id, auth.orgId);
    if (!authorized.ok) {
      return NextResponse.json(
        { error: authorized.status === 403 ? "Forbidden: deal does not belong to your org" : "Deal not found" },
        { status: authorized.status },
      );
    }

    const propertySurvey = await prisma.propertySurvey.findUnique({
      where: { dealId: authorized.dealId },
    });

    return NextResponse.json({
      propertySurvey: propertySurvey
        ? serializePropertySurvey(propertySurvey as PropertySurveyRecord)
        : null,
    });
  } catch (error) {
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
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parseResult = paramsSchema.safeParse(await params);
  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid deal id" }, { status: 400 });
  }

  try {
    const { id } = parseResult.data;
    const authorized = await authorizeDeal(id, auth.orgId);
    if (!authorized.ok) {
      return NextResponse.json(
        { error: authorized.status === 403 ? "Forbidden: deal does not belong to your org" : "Deal not found" },
        { status: authorized.status },
      );
    }

    const body = await request.json();
    const parsed = PropertySurveyPatchInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid property survey payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const payload = toPropertySurveyPayload(parsed.data);
    const propertySurvey = await prisma.propertySurvey.upsert({
      where: { dealId: id },
      create: {
        ...payload,
        dealId: id,
        orgId: auth.orgId,
      },
      update: payload,
    });

    return NextResponse.json({
      propertySurvey: serializePropertySurvey(propertySurvey as PropertySurveyRecord),
    });
  } catch (error) {
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
