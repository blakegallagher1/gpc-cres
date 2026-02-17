import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@entitlement-os/db";
import { PropertyTitlePatchInput, PropertyTitlePatchInputSchema } from "@entitlement-os/shared";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

type DateOrString = Date | string | null | undefined;

type PropertyTitleRecord = {
  id: string;
  orgId: string;
  dealId: string;
  titleInsuranceReceived: boolean | null;
  exceptions: string[];
  liens: string[];
  easements: string[];
  createdAt: DateOrString;
  updatedAt: DateOrString;
};

type PropertyTitleResponse = {
  id: string;
  orgId: string;
  dealId: string;
  titleInsuranceReceived: boolean | null;
  exceptions: string[];
  liens: string[];
  easements: string[];
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

function serializePropertyTitle(propertyTitle: PropertyTitleRecord): PropertyTitleResponse {
  return {
    id: propertyTitle.id,
    orgId: propertyTitle.orgId,
    dealId: propertyTitle.dealId,
    titleInsuranceReceived: propertyTitle.titleInsuranceReceived,
    exceptions: propertyTitle.exceptions,
    liens: propertyTitle.liens,
    easements: propertyTitle.easements,
    createdAt: valueToIsoString(propertyTitle.createdAt),
    updatedAt: valueToIsoString(propertyTitle.updatedAt),
  };
}

function toPropertyTitlePayload(input: PropertyTitlePatchInput) {
  const payload: Record<string, unknown> = {};

  if (input.titleInsuranceReceived !== undefined) {
    payload.titleInsuranceReceived = input.titleInsuranceReceived;
  }
  if (input.exceptions !== undefined) {
    payload.exceptions = input.exceptions;
  }
  if (input.liens !== undefined) {
    payload.liens = input.liens;
  }
  if (input.easements !== undefined) {
    payload.easements = input.easements;
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

    const propertyTitle = await prisma.propertyTitle.findUnique({
      where: { dealId: authorized.dealId },
    });

    return NextResponse.json({
      propertyTitle: propertyTitle ? serializePropertyTitle(propertyTitle as PropertyTitleRecord) : null,
    });
  } catch (error) {
    console.error("Error reading property title:", error);
    return NextResponse.json(
      { error: "Failed to load property title" },
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
    const parsed = PropertyTitlePatchInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid property title payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const payload = toPropertyTitlePayload(parsed.data);
    const propertyTitle = await prisma.propertyTitle.upsert({
      where: { dealId: id },
      create: {
        ...payload,
        dealId: id,
        orgId: auth.orgId,
      },
      update: payload,
    });

    return NextResponse.json({ propertyTitle: serializePropertyTitle(propertyTitle as PropertyTitleRecord) });
  } catch (error) {
    console.error("Error saving property title:", error);
    return NextResponse.json(
      { error: "Failed to save property title" },
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
