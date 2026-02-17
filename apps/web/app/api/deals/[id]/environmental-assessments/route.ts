import { NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { prisma } from "@entitlement-os/db";
import {
  EnvironmentalAssessmentIdSchema,
  EnvironmentalAssessmentPatchInput,
  EnvironmentalAssessmentPatchInputSchema,
  EnvironmentalAssessmentPatchWithIdInputSchema,
  type EnvironmentalAssessmentPatchWithIdInput,
} from "@entitlement-os/shared";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

type DecimalLike = { toString: () => string };
type DateLike = Date | string | null | undefined;

type EnvironmentalAssessmentRecord = {
  id: string;
  orgId: string;
  dealId: string;
  reportType: string | null;
  reportDate: DateLike;
  consultantName: string | null;
  reportTitle: string | null;
  recs: string[];
  deMinimisConditions: string[];
  phaseIiRecommended: boolean | null;
  phaseIiScope: string | null;
  estimatedRemediationCost: DecimalLike | number | null;
  sourceUploadId: string | null;
  notes: string | null;
  createdAt: DateLike;
  updatedAt: DateLike;
};

type ResponseItem = {
  id: string;
  orgId: string;
  dealId: string;
  reportType: string | null;
  reportDate: string | null;
  consultantName: string | null;
  reportTitle: string | null;
  recs: string[];
  deMinimisConditions: string[];
  phaseIiRecommended: boolean | null;
  phaseIiScope: string | null;
  estimatedRemediationCost: string | null;
  sourceUploadId: string | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

function valueToIsoString(value: DateLike): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  return value.toISOString();
}

function valueToString(value: DecimalLike | number | null): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value.toString();
}

function serializeAssessment(item: EnvironmentalAssessmentRecord): ResponseItem {
  return {
    id: item.id,
    orgId: item.orgId,
    dealId: item.dealId,
    reportType: item.reportType,
    reportDate: valueToIsoString(item.reportDate),
    consultantName: item.consultantName,
    reportTitle: item.reportTitle,
    recs: item.recs,
    deMinimisConditions: item.deMinimisConditions,
    phaseIiRecommended: item.phaseIiRecommended,
    phaseIiScope: item.phaseIiScope,
    estimatedRemediationCost: valueToString(item.estimatedRemediationCost),
    sourceUploadId: item.sourceUploadId,
    notes: item.notes,
    createdAt: valueToIsoString(item.createdAt),
    updatedAt: valueToIsoString(item.updatedAt),
  };
}

function toAssessmentPayload(input: EnvironmentalAssessmentPatchInput) {
  const payload: Record<string, unknown> = {};

  if (input.reportType !== undefined) {
    payload.reportType = input.reportType;
  }
  if (input.reportDate !== undefined) {
    payload.reportDate = input.reportDate;
  }
  if (input.consultantName !== undefined) {
    payload.consultantName = input.consultantName;
  }
  if (input.reportTitle !== undefined) {
    payload.reportTitle = input.reportTitle;
  }
  if (input.recs !== undefined) {
    payload.recs = input.recs;
  }
  if (input.deMinimisConditions !== undefined) {
    payload.deMinimisConditions = input.deMinimisConditions;
  }
  if (input.phaseIiRecommended !== undefined) {
    payload.phaseIiRecommended = input.phaseIiRecommended;
  }
  if (input.phaseIiScope !== undefined) {
    payload.phaseIiScope = input.phaseIiScope;
  }
  if (input.estimatedRemediationCost !== undefined) {
    payload.estimatedRemediationCost = input.estimatedRemediationCost;
  }
  if (input.sourceUploadId !== undefined) {
    payload.sourceUploadId = input.sourceUploadId;
  }
  if (input.notes !== undefined) {
    payload.notes = input.notes;
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
      const status = authorized.status;
      return NextResponse.json(
        { error: status === 403 ? "Forbidden: deal does not belong to your org" : "Deal not found" },
        { status },
      );
    }

    const assessments = await prisma.environmentalAssessment.findMany({
      where: { dealId: authorized.dealId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      environmentalAssessments: assessments.map((item) =>
        serializeAssessment(item as EnvironmentalAssessmentRecord)
      ),
    });
  } catch (error) {
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
      const status = authorized.status;
      return NextResponse.json(
        { error: status === 403 ? "Forbidden: deal does not belong to your org" : "Deal not found" },
        { status },
      );
    }

    const body = await request.json();
    const parsed = EnvironmentalAssessmentPatchInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid environmental assessment payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const payload = toAssessmentPayload(parsed.data);

    const assessment = await prisma.environmentalAssessment.create({
      data: {
        ...payload,
        orgId: auth.orgId,
        dealId: authorized.dealId,
      },
    });

    return NextResponse.json({
      environmentalAssessment: serializeAssessment(
        assessment as EnvironmentalAssessmentRecord
      ),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid environmental assessment payload", issues: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    console.error("Error creating environmental assessment:", error);
    return NextResponse.json(
      { error: "Failed to save environmental assessment" },
      { status: 500 },
    );
  }
}

function parsePatchPayload(body: EnvironmentalAssessmentPatchWithIdInput) {
  return {
    id: body.id,
    payload: toAssessmentPayload(body),
  };
}

export async function PATCH(
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
      const status = authorized.status;
      return NextResponse.json(
        { error: status === 403 ? "Forbidden: deal does not belong to your org" : "Deal not found" },
        { status },
      );
    }

    const body = await request.json();
    const parsed = EnvironmentalAssessmentPatchWithIdInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid environmental assessment payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { id: assessmentId, payload } = parsePatchPayload(parsed.data as EnvironmentalAssessmentPatchWithIdInput);

    const existing = await prisma.environmentalAssessment.findFirst({
      where: { id: assessmentId, orgId: auth.orgId, dealId: authorized.dealId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Environmental assessment not found" }, { status: 404 });
    }

    const assessment = await prisma.environmentalAssessment.update({
      where: { id: assessmentId },
      data: payload,
    });

    return NextResponse.json({
      environmentalAssessment: serializeAssessment(assessment as EnvironmentalAssessmentRecord),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid environmental assessment payload", issues: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
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
      const status = authorized.status;
      return NextResponse.json(
        { error: status === 403 ? "Forbidden: deal does not belong to your org" : "Deal not found" },
        { status },
      );
    }

    const body = await request.json();
    const parsed = EnvironmentalAssessmentIdSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid environmental assessment id" }, { status: 400 });
    }

    const existing = await prisma.environmentalAssessment.findFirst({
      where: { id: parsed.data.id, orgId: auth.orgId, dealId: authorized.dealId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Environmental assessment not found" }, { status: 404 });
    }

    const deleted = await prisma.environmentalAssessment.delete({
      where: { id: parsed.data.id },
    });

    return NextResponse.json({
      environmentalAssessment: serializeAssessment(deleted as EnvironmentalAssessmentRecord),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid environmental assessment id", issues: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    console.error("Error deleting environmental assessment:", error);
    return NextResponse.json(
      { error: "Failed to delete environmental assessment" },
      { status: 500 },
    );
  }
}
