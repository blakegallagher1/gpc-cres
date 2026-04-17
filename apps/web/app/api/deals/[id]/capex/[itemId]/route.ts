import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";

import {
  AssetManagementAccessError,
  CAPEX_CATEGORIES,
  CAPEX_STATUSES,
  deleteCapExItem,
  updateCapExItem,
  type CapExCategory,
  type CapExStatus,
} from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const paramsSchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
});

const patchSchema = z.object({
  category: z
    .enum(CAPEX_CATEGORIES as unknown as [CapExCategory, ...CapExCategory[]])
    .optional(),
  description: z.string().min(1).max(2000).optional(),
  estimatedCost: z.number().nonnegative().nullable().optional(),
  actualCost: z.number().nonnegative().nullable().optional(),
  plannedFor: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  status: z
    .enum(CAPEX_STATUSES as unknown as [CapExStatus, ...CapExStatus[]])
    .optional(),
  vendor: z.string().max(500).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  let payload: z.infer<typeof patchSchema>;
  try {
    payload = patchSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid capex payload", issues: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const item = await updateCapExItem({
      orgId: auth.orgId,
      dealId: parsed.data.id,
      itemId: parsed.data.itemId,
      ...payload,
    });
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof AssetManagementAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.capex.item", method: "PATCH" },
    });
    return NextResponse.json({ error: "Failed to update capex item" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  try {
    await deleteCapExItem({
      orgId: auth.orgId,
      dealId: parsed.data.id,
      itemId: parsed.data.itemId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AssetManagementAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.capex.item", method: "DELETE" },
    });
    return NextResponse.json({ error: "Failed to delete capex item" }, { status: 500 });
  }
}
