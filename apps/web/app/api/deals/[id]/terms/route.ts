import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@entitlement-os/db";
import {
  DealTermsPatchInput,
  DealTermsPatchInputSchema,
} from "@entitlement-os/shared";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

type DecimalLike = { toString: () => string };

type DealTermsRecord = {
  id: string;
  orgId: string;
  dealId: string;
  offerPrice: DecimalLike | number | null;
  earnestMoney: DecimalLike | number | null;
  closingDate: Date | string | null;
  titleCompany: string | null;
  dueDiligenceDays: number | null;
  financingContingencyDays: number | null;
  loiSignedAt: Date | string | null;
  psaSignedAt: Date | string | null;
  titleReviewDue: Date | string | null;
  surveyDue: Date | string | null;
  environmentalDue: Date | string | null;
  sellerContact: string | null;
  brokerContact: string | null;
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

function valueToString(value: DecimalLike | number | null): string | null {
  if (value === null) {
    return null;
  }
  return value.toString();
}

function serializeTerms(terms: DealTermsRecord) {
  return {
    id: terms.id,
    orgId: terms.orgId,
    dealId: terms.dealId,
    offerPrice: valueToString(terms.offerPrice),
    earnestMoney: valueToString(terms.earnestMoney),
    closingDate: valueToIsoString(terms.closingDate),
    titleCompany: terms.titleCompany,
    dueDiligenceDays: terms.dueDiligenceDays,
    financingContingencyDays: terms.financingContingencyDays,
    loiSignedAt: valueToIsoString(terms.loiSignedAt),
    psaSignedAt: valueToIsoString(terms.psaSignedAt),
    titleReviewDue: valueToIsoString(terms.titleReviewDue),
    surveyDue: valueToIsoString(terms.surveyDue),
    environmentalDue: valueToIsoString(terms.environmentalDue),
    sellerContact: terms.sellerContact,
    brokerContact: terms.brokerContact,
    createdAt: valueToIsoString(terms.createdAt),
    updatedAt: valueToIsoString(terms.updatedAt),
  };
}

function toTermsPayload(input: DealTermsPatchInput) {
  const payload: Record<string, unknown> = {};
  if (input.offerPrice !== undefined) {
    payload.offerPrice = input.offerPrice;
  }
  if (input.earnestMoney !== undefined) {
    payload.earnestMoney = input.earnestMoney;
  }
  if (input.closingDate !== undefined) {
    payload.closingDate = input.closingDate;
  }
  if (input.titleCompany !== undefined) {
    payload.titleCompany = input.titleCompany;
  }
  if (input.dueDiligenceDays !== undefined) {
    payload.dueDiligenceDays = input.dueDiligenceDays;
  }
  if (input.financingContingencyDays !== undefined) {
    payload.financingContingencyDays = input.financingContingencyDays;
  }
  if (input.loiSignedAt !== undefined) {
    payload.loiSignedAt = input.loiSignedAt;
  }
  if (input.psaSignedAt !== undefined) {
    payload.psaSignedAt = input.psaSignedAt;
  }
  if (input.titleReviewDue !== undefined) {
    payload.titleReviewDue = input.titleReviewDue;
  }
  if (input.surveyDue !== undefined) {
    payload.surveyDue = input.surveyDue;
  }
  if (input.environmentalDue !== undefined) {
    payload.environmentalDue = input.environmentalDue;
  }
  if (input.sellerContact !== undefined) {
    payload.sellerContact = input.sellerContact;
  }
  if (input.brokerContact !== undefined) {
    payload.brokerContact = input.brokerContact;
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

    const terms = await prisma.dealTerms.findUnique({
      where: { dealId: authorized.dealId },
    });

    return NextResponse.json({
      terms: terms ? serializeTerms(terms as DealTermsRecord) : null,
    });
  } catch (error) {
    console.error("Error reading deal terms:", error);
    return NextResponse.json(
      { error: "Failed to load deal terms" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleUpsertTerms(request, params, "PUT");
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleUpsertTerms(request, params, "PATCH");
}

async function handleUpsertTerms(
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
    const parsed = DealTermsPatchInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid terms payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const payload = toTermsPayload(parsed.data);

    const terms = await prisma.dealTerms.upsert({
      where: { dealId: id },
      create: {
        ...payload,
        dealId: id,
        orgId: auth.orgId,
      },
      update: payload,
    });

    return NextResponse.json({ terms: serializeTerms(terms as DealTermsRecord) });
  } catch (error) {
    console.error("Error upserting deal terms:", error);
    return NextResponse.json(
      { error: "Failed to save deal terms" },
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

    const deleted = await prisma.dealTerms.delete({ where: { dealId: id } });

    return NextResponse.json({ terms: serializeTerms(deleted as DealTermsRecord) });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Record to delete does not exist")) {
      return NextResponse.json({ error: "Deal terms not found" }, { status: 404 });
    }
    console.error("Error deleting deal terms:", error);
    return NextResponse.json(
      { error: "Failed to delete deal terms" },
      { status: 500 },
    );
  }
}
