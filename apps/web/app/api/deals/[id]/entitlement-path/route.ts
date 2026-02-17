import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@entitlement-os/db";
import {
  EntitlementPathPatchInput,
  EntitlementPathPatchInputSchema,
} from "@entitlement-os/shared";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

type EntitlementPathRecord = {
  id: string;
  orgId: string;
  dealId: string;
  recommendedStrategy: string | null;
  preAppMeetingDate: Date | string | null;
  preAppMeetingNotes: string | null;
  applicationType: string | null;
  applicationSubmittedDate: Date | string | null;
  applicationNumber: string | null;
  publicNoticeDate: Date | string | null;
  publicNoticePeriodDays: number | null;
  hearingScheduledDate: Date | string | null;
  hearingBody: string | null;
  hearingNotes: string | null;
  decisionDate: Date | string | null;
  decisionType: string | null;
  conditions: string[];
  appealDeadline: Date | string | null;
  appealFiled: boolean | null;
  conditionComplianceStatus: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

function valueToIsoString(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  return value.toISOString();
}

function serializeEntitlementPath(path: EntitlementPathRecord) {
  return {
    id: path.id,
    orgId: path.orgId,
    dealId: path.dealId,
    recommendedStrategy: path.recommendedStrategy,
    preAppMeetingDate: valueToIsoString(path.preAppMeetingDate),
    preAppMeetingNotes: path.preAppMeetingNotes,
    applicationType: path.applicationType,
    applicationSubmittedDate: valueToIsoString(path.applicationSubmittedDate),
    applicationNumber: path.applicationNumber,
    publicNoticeDate: valueToIsoString(path.publicNoticeDate),
    publicNoticePeriodDays: path.publicNoticePeriodDays,
    hearingScheduledDate: valueToIsoString(path.hearingScheduledDate),
    hearingBody: path.hearingBody,
    hearingNotes: path.hearingNotes,
    decisionDate: valueToIsoString(path.decisionDate),
    decisionType: path.decisionType,
    conditions: path.conditions,
    appealDeadline: valueToIsoString(path.appealDeadline),
    appealFiled: path.appealFiled,
    conditionComplianceStatus: path.conditionComplianceStatus,
    createdAt: valueToIsoString(path.createdAt),
    updatedAt: valueToIsoString(path.updatedAt),
  };
}

function toEntitlementPayload(input: EntitlementPathPatchInput) {
  const payload: Record<string, unknown> = {};

  if (input.recommendedStrategy !== undefined) {
    payload.recommendedStrategy = input.recommendedStrategy;
  }
  if (input.preAppMeetingDate !== undefined) {
    payload.preAppMeetingDate = input.preAppMeetingDate;
  }
  if (input.preAppMeetingNotes !== undefined) {
    payload.preAppMeetingNotes = input.preAppMeetingNotes;
  }
  if (input.applicationType !== undefined) {
    payload.applicationType = input.applicationType;
  }
  if (input.applicationSubmittedDate !== undefined) {
    payload.applicationSubmittedDate = input.applicationSubmittedDate;
  }
  if (input.applicationNumber !== undefined) {
    payload.applicationNumber = input.applicationNumber;
  }
  if (input.publicNoticeDate !== undefined) {
    payload.publicNoticeDate = input.publicNoticeDate;
  }
  if (input.publicNoticePeriodDays !== undefined) {
    payload.publicNoticePeriodDays = input.publicNoticePeriodDays;
  }
  if (input.hearingScheduledDate !== undefined) {
    payload.hearingScheduledDate = input.hearingScheduledDate;
  }
  if (input.hearingBody !== undefined) {
    payload.hearingBody = input.hearingBody;
  }
  if (input.hearingNotes !== undefined) {
    payload.hearingNotes = input.hearingNotes;
  }
  if (input.decisionDate !== undefined) {
    payload.decisionDate = input.decisionDate;
  }
  if (input.decisionType !== undefined) {
    payload.decisionType = input.decisionType;
  }
  if (input.conditions !== undefined) {
    payload.conditions = input.conditions;
  }
  if (input.appealDeadline !== undefined) {
    payload.appealDeadline = input.appealDeadline;
  }
  if (input.appealFiled !== undefined) {
    payload.appealFiled = input.appealFiled;
  }
  if (input.conditionComplianceStatus !== undefined) {
    payload.conditionComplianceStatus = input.conditionComplianceStatus;
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

    const entitlementPath = await prisma.entitlementPath.findUnique({
      where: { dealId: authorized.dealId },
    });

    return NextResponse.json({
      entitlementPath: entitlementPath
        ? serializeEntitlementPath(entitlementPath as EntitlementPathRecord)
        : null,
    });
  } catch (error) {
    console.error("Error reading entitlement path:", error);
    return NextResponse.json(
      { error: "Failed to load entitlement path" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleUpsertEntitlementPath(request, params);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleUpsertEntitlementPath(request, params);
}

async function handleUpsertEntitlementPath(
  request: NextRequest,
  paramsPromise: Promise<{ id: string }>,
) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parseResult = paramsSchema.safeParse(await paramsPromise);
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
    const parsed = EntitlementPathPatchInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid entitlement path payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const payload = toEntitlementPayload(parsed.data);

    const entitlementPath = await prisma.entitlementPath.upsert({
      where: { dealId: id },
      create: {
        ...payload,
        dealId: id,
        orgId: auth.orgId,
      },
      update: payload,
    });

    return NextResponse.json({ entitlementPath: serializeEntitlementPath(entitlementPath as EntitlementPathRecord) });
  } catch (error) {
    console.error("Error upserting entitlement path:", error);
    return NextResponse.json(
      { error: "Failed to save entitlement path" },
      { status: 500 },
    );
  }
}

export async function DELETE(
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

    const deleted = await prisma.entitlementPath.delete({ where: { dealId: id } });

    return NextResponse.json({ entitlementPath: serializeEntitlementPath(deleted as EntitlementPathRecord) });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Record to delete does not exist")) {
      return NextResponse.json(
        { error: "Entitlement path not found" },
        { status: 404 },
      );
    }
    console.error("Error deleting entitlement path:", error);
    return NextResponse.json(
      { error: "Failed to delete entitlement path" },
      { status: 500 },
    );
  }
}
