import { NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { prisma } from "@entitlement-os/db";
import {
  DealRiskPatchInput,
  DealRiskPatchInputSchema,
  DealRiskPatchWithIdInput,
  DealRiskPatchWithIdInputSchema,
  DealRiskIdSchema,
} from "@entitlement-os/shared";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

type DateOrString = Date | string | null | undefined;

type RiskRecord = {
  id: string;
  orgId: string;
  dealId: string;
  category: string | null;
  title: string | null;
  description: string | null;
  severity: string | null;
  status: string | null;
  owner: string | null;
  source: string | null;
  score: number | null;
  notes: string | null;
  createdAt: DateOrString;
  updatedAt: DateOrString;
};

type ResponseItem = {
  id: string;
  orgId: string;
  dealId: string;
  category: string | null;
  title: string | null;
  description: string | null;
  severity: string | null;
  status: string | null;
  owner: string | null;
  source: string | null;
  score: number | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

function toIsoString(value: DateOrString): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  return value.toISOString();
}

function serializeRisk(item: RiskRecord): ResponseItem {
  return {
    id: item.id,
    orgId: item.orgId,
    dealId: item.dealId,
    category: item.category,
    title: item.title,
    description: item.description,
    severity: item.severity,
    status: item.status,
    owner: item.owner,
    source: item.source,
    score: item.score,
    notes: item.notes,
    createdAt: toIsoString(item.createdAt),
    updatedAt: toIsoString(item.updatedAt),
  };
}

function toRiskPayload(input: DealRiskPatchInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (input.category !== undefined) {
    payload.category = input.category;
  }
  if (input.title !== undefined) {
    payload.title = input.title;
  }
  if (input.description !== undefined) {
    payload.description = input.description;
  }
  if (input.severity !== undefined) {
    payload.severity = input.severity;
  }
  if (input.status !== undefined) {
    payload.status = input.status;
  }
  if (input.owner !== undefined) {
    payload.owner = input.owner;
  }
  if (input.source !== undefined) {
    payload.source = input.source;
  }
  if (input.score !== undefined) {
    payload.score = input.score;
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

    const risks = await prisma.dealRisk.findMany({
      where: { dealId: authorized.dealId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ risks: risks.map((risk) => serializeRisk(risk as RiskRecord)) });
  } catch (error) {
    console.error("Error reading deal risks:", error);
    return NextResponse.json(
      { error: "Failed to load deal risks" },
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
    const parsed = DealRiskPatchInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid risk payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const payload = toRiskPayload(parsed.data);
    const risk = await prisma.dealRisk.create({
      data: {
        ...payload,
        orgId: auth.orgId,
        dealId: authorized.dealId,
      },
    });

    return NextResponse.json({ risk: serializeRisk(risk as RiskRecord) });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid risk payload", issues: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    console.error("Error creating deal risk:", error);
    return NextResponse.json(
      { error: "Failed to save deal risk" },
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
    const parsed = DealRiskPatchWithIdInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid risk payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { id: riskId, ...rest } = parsed.data as DealRiskPatchWithIdInput;
    const payload = toRiskPayload(rest as DealRiskPatchInput);

    const existing = await prisma.dealRisk.findFirst({
      where: { id: riskId, orgId: auth.orgId, dealId: authorized.dealId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Deal risk not found" }, { status: 404 });
    }

    const risk = await prisma.dealRisk.update({
      where: { id: riskId },
      data: payload,
    });

    return NextResponse.json({ risk: serializeRisk(risk as RiskRecord) });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid risk payload", issues: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    console.error("Error updating deal risk:", error);
    return NextResponse.json(
      { error: "Failed to update deal risk" },
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
    const parsed = DealRiskIdSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid risk id" }, { status: 400 });
    }

    const existing = await prisma.dealRisk.findFirst({
      where: { id: parsed.data.id, orgId: auth.orgId, dealId: authorized.dealId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Deal risk not found" }, { status: 404 });
    }

    const risk = await prisma.dealRisk.delete({
      where: { id: parsed.data.id },
    });

    return NextResponse.json({ risk: serializeRisk(risk as RiskRecord) });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid risk id", issues: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    console.error("Error deleting deal risk:", error);
    return NextResponse.json(
      { error: "Failed to delete deal risk" },
      { status: 500 },
    );
  }
}
