import { NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";

import {
  DealAccessError,
  DealStakeholderNotFoundError,
  createDealStakeholder,
  deleteDealStakeholder,
  listDealStakeholders,
  updateDealStakeholder,
} from "@gpc/server";
import {
  DealStakeholderCreateInputSchema,
  DealStakeholderIdSchema,
  DealStakeholderPatchWithIdInput,
  DealStakeholderPatchWithIdInputSchema,
} from "@entitlement-os/shared";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
    const { stakeholders } = await listDealStakeholders({ dealId: id, orgId: auth.orgId });
    return NextResponse.json({ stakeholders });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json(
        { error: error.status === 403 ? "Forbidden: deal does not belong to your org" : "Deal not found" },
        { status: error.status },
      );
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.stakeholders", method: "GET" },
    });
    console.error("Error reading deal stakeholders:", error);
    return NextResponse.json({ error: "Failed to load stakeholders" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
    const parsed = DealStakeholderCreateInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid stakeholder payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { stakeholder } = await createDealStakeholder({
      dealId: id,
      orgId: auth.orgId,
      payload: parsed.data,
    });

    return NextResponse.json({ stakeholder });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json(
        { error: error.status === 403 ? "Forbidden: deal does not belong to your org" : "Deal not found" },
        { status: error.status },
      );
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.stakeholders", method: "POST" },
    });
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
    const parsed = DealStakeholderPatchWithIdInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid stakeholder payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { id: stakeholderId, ...patchData } = parsed.data as DealStakeholderPatchWithIdInput;
    const { stakeholder } = await updateDealStakeholder({
      dealId: id,
      orgId: auth.orgId,
      stakeholderId,
      payload: patchData,
    });

    return NextResponse.json({ stakeholder });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json(
        { error: error.status === 403 ? "Forbidden: deal does not belong to your org" : "Deal not found" },
        { status: error.status },
      );
    }
    if (error instanceof DealStakeholderNotFoundError) {
      return NextResponse.json({ error: "Stakeholder not found" }, { status: 404 });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.stakeholders", method: "PATCH" },
    });
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
    const parsed = DealStakeholderIdSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid stakeholder id", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { stakeholder } = await deleteDealStakeholder({
      dealId: id,
      orgId: auth.orgId,
      stakeholderId: parsed.data.id,
    });

    return NextResponse.json({ stakeholder });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json(
        { error: error.status === 403 ? "Forbidden: deal does not belong to your org" : "Deal not found" },
        { status: error.status },
      );
    }
    if (error instanceof DealStakeholderNotFoundError) {
      return NextResponse.json({ error: "Stakeholder not found" }, { status: 404 });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.stakeholders", method: "DELETE" },
    });
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
