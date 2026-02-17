import { NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { prisma } from "@entitlement-os/db";
import {
  DealFinancingIdSchema,
  DealFinancingPatchInput,
  DealFinancingPatchInputSchema,
  DealFinancingPatchWithIdInputSchema,
  type DealFinancingPatchWithIdInput,
} from "@entitlement-os/shared";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

type DecimalLike = { toString: () => string };
type DateLike = Date | string | null;

type DealFinancingRecord = {
  id: string;
  orgId: string;
  dealId: string;
  lenderName: string | null;
  facilityName: string | null;
  loanType: string | null;
  loanAmount: DecimalLike | number | null;
  commitmentDate: DateLike;
  fundedDate: DateLike;
  interestRate: DecimalLike | number | null;
  loanTermMonths: number | null;
  amortizationYears: number | null;
  ltvPercent: DecimalLike | number | null;
  dscrRequirement: DecimalLike | number | null;
  originationFeePercent: DecimalLike | number | null;
  sourceUploadId: string | null;
  status: string | null;
  notes: string | null;
  createdAt: DateLike;
  updatedAt: DateLike;
};

type ResponseItem = {
  id: string;
  orgId: string;
  dealId: string;
  lenderName: string | null;
  facilityName: string | null;
  loanType: string | null;
  loanAmount: string | null;
  commitmentDate: string | null;
  fundedDate: string | null;
  interestRate: string | null;
  loanTermMonths: number | null;
  amortizationYears: number | null;
  ltvPercent: string | null;
  dscrRequirement: string | null;
  originationFeePercent: string | null;
  sourceUploadId: string | null;
  status: string | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

function valueToIsoString(value: DateLike): string | null {
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

function serializeFinancing(item: DealFinancingRecord): ResponseItem {
  return {
    id: item.id,
    orgId: item.orgId,
    dealId: item.dealId,
    lenderName: item.lenderName,
    facilityName: item.facilityName,
    loanType: item.loanType,
    loanAmount: valueToString(item.loanAmount),
    commitmentDate: valueToIsoString(item.commitmentDate),
    fundedDate: valueToIsoString(item.fundedDate),
    interestRate: valueToString(item.interestRate),
    loanTermMonths: item.loanTermMonths,
    amortizationYears: item.amortizationYears,
    ltvPercent: valueToString(item.ltvPercent),
    dscrRequirement: valueToString(item.dscrRequirement),
    originationFeePercent: valueToString(item.originationFeePercent),
    sourceUploadId: item.sourceUploadId,
    status: item.status,
    notes: item.notes,
    createdAt: valueToIsoString(item.createdAt),
    updatedAt: valueToIsoString(item.updatedAt),
  };
}

function toFinancingPayload(input: DealFinancingPatchInput) {
  const payload: Record<string, unknown> = {};

  if (input.lenderName !== undefined) {
    payload.lenderName = input.lenderName;
  }
  if (input.facilityName !== undefined) {
    payload.facilityName = input.facilityName;
  }
  if (input.loanType !== undefined) {
    payload.loanType = input.loanType;
  }
  if (input.loanAmount !== undefined) {
    payload.loanAmount = input.loanAmount;
  }
  if (input.commitmentDate !== undefined) {
    payload.commitmentDate = input.commitmentDate;
  }
  if (input.fundedDate !== undefined) {
    payload.fundedDate = input.fundedDate;
  }
  if (input.interestRate !== undefined) {
    payload.interestRate = input.interestRate;
  }
  if (input.loanTermMonths !== undefined) {
    payload.loanTermMonths = input.loanTermMonths;
  }
  if (input.amortizationYears !== undefined) {
    payload.amortizationYears = input.amortizationYears;
  }
  if (input.ltvPercent !== undefined) {
    payload.ltvPercent = input.ltvPercent;
  }
  if (input.dscrRequirement !== undefined) {
    payload.dscrRequirement = input.dscrRequirement;
  }
  if (input.originationFeePercent !== undefined) {
    payload.originationFeePercent = input.originationFeePercent;
  }
  if (input.sourceUploadId !== undefined) {
    payload.sourceUploadId = input.sourceUploadId;
  }
  if (input.status !== undefined) {
    payload.status = input.status;
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

    const financings = await prisma.dealFinancing.findMany({
      where: { dealId: authorized.dealId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      financings: financings.map((item) => serializeFinancing(item as DealFinancingRecord)),
    });
  } catch (error) {
    console.error("Error reading deal financings:", error);
    return NextResponse.json(
      { error: "Failed to load financings" },
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
    const parsed = DealFinancingPatchInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid financing payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const payload = toFinancingPayload(parsed.data);

    const financing = await prisma.dealFinancing.create({
      data: {
        ...payload,
        orgId: auth.orgId,
        dealId: authorized.dealId,
      },
    });

    return NextResponse.json({
      financing: serializeFinancing(financing as DealFinancingRecord),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid financing payload", issues: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    console.error("Error creating financing:", error);
    return NextResponse.json(
      { error: "Failed to save financing" },
      { status: 500 },
    );
  }
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
    const parsed = DealFinancingPatchWithIdInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid financing payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { id: financingId, ...rest } = parsed.data as DealFinancingPatchWithIdInput;
    const payload = toFinancingPayload(rest as DealFinancingPatchInput);

    const existing = await prisma.dealFinancing.findFirst({
      where: { id: financingId, orgId: auth.orgId, dealId: authorized.dealId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Financing not found" }, { status: 404 });
    }

    const financing = await prisma.dealFinancing.update({
      where: { id: financingId },
      data: payload,
    });

    return NextResponse.json({
      financing: serializeFinancing(financing as DealFinancingRecord),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid financing payload", issues: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    console.error("Error updating financing:", error);
    return NextResponse.json(
      { error: "Failed to update financing" },
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
    const parsed = DealFinancingIdSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid financing id" }, { status: 400 });
    }

    const existing = await prisma.dealFinancing.findFirst({
      where: { id: parsed.data.id, orgId: auth.orgId, dealId: authorized.dealId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Financing not found" }, { status: 404 });
    }

    const deleted = await prisma.dealFinancing.delete({
      where: { id: parsed.data.id },
    });

    return NextResponse.json({
      financing: serializeFinancing(deleted as DealFinancingRecord),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid financing id", issues: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    console.error("Error deleting financing:", error);
    return NextResponse.json(
      { error: "Failed to delete financing" },
      { status: 500 },
    );
  }
}
