import { NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { prisma } from "@entitlement-os/db";
import {
  DealStakeholderCreateInput,
  DealStakeholderCreateInputSchema,
  DealStakeholderIdSchema,
  DealStakeholderPatchInput,
  DealStakeholderPatchInputSchema,
  DealStakeholderPatchWithIdInput,
  DealStakeholderPatchWithIdInputSchema,
} from "@entitlement-os/shared";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

type DateLike = Date | string | null | undefined;
type DecimalLike = { toString: () => string };

type StakeholderRecord = {
  id: string;
  orgId: string;
  dealId: string;
  role: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  equityOwnership: DecimalLike | number | null;
  decisionRights: string[] | null;
  notes: string | null;
  createdAt: DateLike;
  updatedAt: DateLike;
};

type StakeholderResponse = {
  id: string;
  orgId: string;
  dealId: string;
  role: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  equityOwnership: string | null;
  decisionRights: string[] | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type StakeholdersResponse = {
  stakeholders: StakeholderResponse[];
};

function toIsoString(value: DateLike): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  return value.toISOString();
}

function valueToString(value: DecimalLike | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value.toString();
}

function serializeStakeholder(item: StakeholderRecord): StakeholderResponse {
  return {
    id: item.id,
    orgId: item.orgId,
    dealId: item.dealId,
    role: item.role,
    name: item.name,
    company: item.company,
    email: item.email,
    phone: item.phone,
    equityOwnership: valueToString(item.equityOwnership),
    decisionRights: item.decisionRights ?? null,
    notes: item.notes,
    createdAt: toIsoString(item.createdAt),
    updatedAt: toIsoString(item.updatedAt),
  };
}

function toStakeholderPayload(
  input: DealStakeholderCreateInput | DealStakeholderPatchInput
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (input.name !== undefined) {
    payload.name = input.name;
  }
  if (input.role !== undefined) {
    payload.role = input.role;
  }
  if (input.company !== undefined) {
    payload.company = input.company;
  }
  if (input.email !== undefined) {
    payload.email = input.email;
  }
  if (input.phone !== undefined) {
    payload.phone = input.phone;
  }
  if (input.equityOwnership !== undefined) {
    payload.equityOwnership = input.equityOwnership;
  }
  if (input.notes !== undefined) {
    payload.notes = input.notes;
  }
  if (input.decisionRights !== undefined) {
    payload.decisionRights = input.decisionRights;
  }

  return payload;
}

async function authorizeDeal(
  id: string,
  orgId: string
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
  { params }: { params: Promise<{ id: string }> }
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

    const stakeholders = await prisma.dealStakeholder.findMany({
      where: { dealId: authorized.dealId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      stakeholders: stakeholders.map((item) => serializeStakeholder(item as StakeholderRecord)),
    } satisfies StakeholdersResponse);
  } catch (error) {
    console.error("Error reading deal stakeholders:", error);
    return NextResponse.json({ error: "Failed to load stakeholders" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
    const parsed = DealStakeholderCreateInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid stakeholder payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const payload = parsed.data;
    const stakeholder = await prisma.dealStakeholder.create({
      data: {
        ...payload,
        orgId: auth.orgId,
        dealId: authorized.dealId,
      },
    });

    return NextResponse.json({
      stakeholder: serializeStakeholder(stakeholder as StakeholderRecord),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid stakeholder payload", issues: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    console.error("Error creating deal stakeholder:", error);
    return NextResponse.json({ error: "Failed to save stakeholder" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
    const parsed = DealStakeholderPatchWithIdInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid stakeholder payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { id: stakeholderId, ...patchData } = parsed.data as DealStakeholderPatchWithIdInput;
    const payload = toStakeholderPayload(patchData as DealStakeholderPatchInput);
    const existing = await prisma.dealStakeholder.findFirst({
      where: { id: stakeholderId, orgId: auth.orgId, dealId: authorized.dealId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Stakeholder not found" }, { status: 404 });
    }

    const stakeholder = await prisma.dealStakeholder.update({
      where: { id: stakeholderId },
      data: payload,
    });

    return NextResponse.json({
      stakeholder: serializeStakeholder(stakeholder as StakeholderRecord),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid stakeholder payload", issues: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    console.error("Error updating deal stakeholder:", error);
    return NextResponse.json({ error: "Failed to update stakeholder" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
    const parsed = DealStakeholderIdSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid stakeholder id", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const existing = await prisma.dealStakeholder.findFirst({
      where: { id: parsed.data.id, orgId: auth.orgId, dealId: authorized.dealId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Stakeholder not found" }, { status: 404 });
    }

    const stakeholder = await prisma.dealStakeholder.delete({
      where: { id: parsed.data.id },
    });

    return NextResponse.json({
      stakeholder: serializeStakeholder(stakeholder as StakeholderRecord),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid stakeholder id", issues: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    console.error("Error deleting deal stakeholder:", error);
    return NextResponse.json({ error: "Failed to delete stakeholder" }, { status: 500 });
  }
}
