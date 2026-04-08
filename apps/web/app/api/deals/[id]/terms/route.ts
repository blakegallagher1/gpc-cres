import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  DealAccessError,
  DealTermsNotFoundError,
  deleteDealTerms,
  getDealTerms,
  upsertDealTerms,
} from "@gpc/server";
import {
  DealTermsPatchInputSchema,
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
    const { terms } = await getDealTerms({ dealId: id, orgId: auth.orgId });
    return NextResponse.json({ terms });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json(
        { error: error.status === 403 ? "Forbidden: deal does not belong to your org" : "Deal not found" },
        { status: error.status },
      );
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.terms", method: "GET" },
    });
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
  return handleUpsertTerms(request, params);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleUpsertTerms(request, params);
}

async function handleUpsertTerms(
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
    const parsed = DealTermsPatchInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid terms payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { terms } = await upsertDealTerms({
      dealId: id,
      orgId: auth.orgId,
      payload: parsed.data,
    });

    return NextResponse.json({ terms });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json(
        { error: error.status === 403 ? "Forbidden: deal does not belong to your org" : "Deal not found" },
        { status: error.status },
      );
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.terms", method: "PATCH" },
    });
    console.error("Error upserting deal terms:", error);
    return NextResponse.json(
      { error: "Failed to save deal terms" },
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
    const { terms } = await deleteDealTerms({ dealId: id, orgId: auth.orgId });
    return NextResponse.json({ terms });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json(
        { error: error.status === 403 ? "Forbidden: deal does not belong to your org" : "Deal not found" },
        { status: error.status },
      );
    }
    if (error instanceof DealTermsNotFoundError) {
      return NextResponse.json({ error: "Deal terms not found" }, { status: 404 });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.terms", method: "DELETE" },
    });
    console.error("Error deleting deal terms:", error);
    return NextResponse.json(
      { error: "Failed to delete deal terms" },
      { status: 500 },
    );
  }
}
