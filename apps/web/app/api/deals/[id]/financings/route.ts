import { NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";

import {
  createDealFinancing,
  DealAccessError,
  DealFinancingNotFoundError,
  deleteDealFinancing,
  listDealFinancings,
  updateDealFinancing,
} from "@gpc/server";
import {
  DealFinancingIdSchema,
  DealFinancingPatchInputSchema,
  DealFinancingPatchWithIdInputSchema,
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
    const financings = await listDealFinancings({
      dealId: id,
      orgId: auth.orgId,
    });

    return NextResponse.json({
      financings,
    });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json(
        {
          error:
            error.status === 403
              ? "Forbidden: deal does not belong to your org"
              : "Deal not found",
        },
        { status: error.status },
      );
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.financings", method: "GET" },
    });
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
    const parsed = DealFinancingPatchInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid financing payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const financing = await createDealFinancing({
      dealId: id,
      orgId: auth.orgId,
      input: parsed.data,
    });

    return NextResponse.json({ financing });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid financing payload", issues: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    if (error instanceof DealAccessError) {
      return NextResponse.json(
        {
          error:
            error.status === 403
              ? "Forbidden: deal does not belong to your org"
              : "Deal not found",
        },
        { status: error.status },
      );
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.financings", method: "POST" },
    });
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
    const parsed = DealFinancingPatchWithIdInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid financing payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const financing = await updateDealFinancing({
      dealId: id,
      orgId: auth.orgId,
      input: parsed.data,
    });

    return NextResponse.json({ financing });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid financing payload", issues: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    if (error instanceof DealAccessError) {
      return NextResponse.json(
        {
          error:
            error.status === 403
              ? "Forbidden: deal does not belong to your org"
              : "Deal not found",
        },
        { status: error.status },
      );
    }
    if (error instanceof DealFinancingNotFoundError) {
      return NextResponse.json({ error: "Financing not found" }, { status: 404 });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.financings", method: "PATCH" },
    });
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
    const parsed = DealFinancingIdSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid financing id" }, { status: 400 });
    }

    const financing = await deleteDealFinancing({
      dealId: id,
      orgId: auth.orgId,
      financingId: parsed.data.id,
    });

    return NextResponse.json({ financing });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid financing id", issues: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    if (error instanceof DealAccessError) {
      return NextResponse.json(
        {
          error:
            error.status === 403
              ? "Forbidden: deal does not belong to your org"
              : "Deal not found",
        },
        { status: error.status },
      );
    }
    if (error instanceof DealFinancingNotFoundError) {
      return NextResponse.json({ error: "Financing not found" }, { status: 404 });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.financings", method: "DELETE" },
    });
    console.error("Error deleting financing:", error);
    return NextResponse.json(
      { error: "Failed to delete financing" },
      { status: 500 },
    );
  }
}
