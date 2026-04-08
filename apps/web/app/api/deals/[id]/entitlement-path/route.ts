import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  DealAccessError,
  DealEntitlementPathNotFoundError,
  deleteEntitlementPathForDeal,
  getEntitlementPathForDeal,
  upsertEntitlementPathForDeal,
} from "@gpc/server";
import {
  EntitlementPathPatchInput,
  EntitlementPathPatchInputSchema,
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
    const { entitlementPath } = await getEntitlementPathForDeal({
      dealId: id,
      orgId: auth.orgId,
    });

    return NextResponse.json({ entitlementPath });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json(
        { error: error.status === 403 ? "Forbidden: deal does not belong to your org" : "Deal not found" },
        { status: error.status },
      );
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.entitlement-path", method: "GET" },
    });
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
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parseResult = paramsSchema.safeParse(await paramsPromise);
  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid deal id" }, { status: 400 });
  }

  try {
    const { id } = parseResult.data;
    const body = await request.json();
    const parsed = EntitlementPathPatchInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid entitlement path payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { entitlementPath } = await upsertEntitlementPathForDeal({
      dealId: id,
      orgId: auth.orgId,
      payload: parsed.data as EntitlementPathPatchInput,
    });

    return NextResponse.json({ entitlementPath });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json(
        { error: error.status === 403 ? "Forbidden: deal does not belong to your org" : "Deal not found" },
        { status: error.status },
      );
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.entitlement-path", method: "PATCH" },
    });
    console.error("Error upserting entitlement path:", error);
    return NextResponse.json(
      { error: "Failed to save entitlement path" },
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
    const { entitlementPath } = await deleteEntitlementPathForDeal({
      dealId: id,
      orgId: auth.orgId,
    });

    return NextResponse.json({ entitlementPath });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json(
        { error: error.status === 403 ? "Forbidden: deal does not belong to your org" : "Deal not found" },
        { status: error.status },
      );
    }
    if (error instanceof DealEntitlementPathNotFoundError) {
      return NextResponse.json(
        { error: "Entitlement path not found" },
        { status: 404 },
      );
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.entitlement-path", method: "DELETE" },
    });
    console.error("Error deleting entitlement path:", error);
    return NextResponse.json(
      { error: "Failed to delete entitlement path" },
      { status: 500 },
    );
  }
}
