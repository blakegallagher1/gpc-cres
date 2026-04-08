import { NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";

import {
  DealAccessError,
  DealRiskNotFoundError,
  createDealRisk,
  deleteDealRisk,
  listDealRisks,
  updateDealRisk,
} from "@gpc/server";
import {
  DealRiskPatchInputSchema,
  DealRiskPatchWithIdInput,
  DealRiskPatchWithIdInputSchema,
  DealRiskIdSchema,
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
    const { risks } = await listDealRisks({ dealId: id, orgId: auth.orgId });
    return NextResponse.json({ risks });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json(
        { error: error.status === 403 ? "Forbidden: deal does not belong to your org" : "Deal not found" },
        { status: error.status },
      );
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.risks", method: "GET" },
    });
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
    const parsed = DealRiskPatchInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid risk payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { risk } = await createDealRisk({
      dealId: id,
      orgId: auth.orgId,
      payload: parsed.data,
    });

    return NextResponse.json({ risk });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json(
        { error: error.status === 403 ? "Forbidden: deal does not belong to your org" : "Deal not found" },
        { status: error.status },
      );
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.risks", method: "POST" },
    });
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
    const parsed = DealRiskPatchWithIdInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid risk payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { id: riskId, ...rest } = parsed.data as DealRiskPatchWithIdInput;
    const { risk } = await updateDealRisk({
      dealId: id,
      orgId: auth.orgId,
      riskId,
      payload: rest,
    });

    return NextResponse.json({ risk });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json(
        { error: error.status === 403 ? "Forbidden: deal does not belong to your org" : "Deal not found" },
        { status: error.status },
      );
    }
    if (error instanceof DealRiskNotFoundError) {
      return NextResponse.json({ error: "Deal risk not found" }, { status: 404 });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.risks", method: "PATCH" },
    });
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
    const parsed = DealRiskIdSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid risk id" }, { status: 400 });
    }

    const { risk } = await deleteDealRisk({
      dealId: id,
      orgId: auth.orgId,
      riskId: parsed.data.id,
    });

    return NextResponse.json({ risk });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json(
        { error: error.status === 403 ? "Forbidden: deal does not belong to your org" : "Deal not found" },
        { status: error.status },
      );
    }
    if (error instanceof DealRiskNotFoundError) {
      return NextResponse.json({ error: "Deal risk not found" }, { status: 404 });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.risks", method: "DELETE" },
    });
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
