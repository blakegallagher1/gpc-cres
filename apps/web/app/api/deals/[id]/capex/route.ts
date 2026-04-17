import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";

import {
  AssetManagementAccessError,
  CAPEX_CATEGORIES,
  CAPEX_STATUSES,
  createCapExItem,
  listCapExItems,
  type CapExCategory,
  type CapExStatus,
} from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const paramsSchema = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  category: z.enum(CAPEX_CATEGORIES as unknown as [CapExCategory, ...CapExCategory[]]),
  description: z.string().min(1).max(2000),
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid deal id" }, { status: 400 });
  }

  try {
    const items = await listCapExItems(auth.orgId, parsed.data.id);
    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof AssetManagementAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.capex", method: "GET" },
    });
    return NextResponse.json({ error: "Failed to load capex items" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid deal id" }, { status: 400 });
  }

  let payload: z.infer<typeof createSchema>;
  try {
    payload = createSchema.parse(await request.json());
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
    const item = await createCapExItem({
      orgId: auth.orgId,
      dealId: parsed.data.id,
      category: payload.category,
      description: payload.description,
      estimatedCost: payload.estimatedCost ?? null,
      actualCost: payload.actualCost ?? null,
      plannedFor: payload.plannedFor ?? null,
      completedAt: payload.completedAt ?? null,
      status: payload.status,
      vendor: payload.vendor ?? null,
      notes: payload.notes ?? null,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof AssetManagementAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.capex", method: "POST" },
    });
    return NextResponse.json({ error: "Failed to create capex item" }, { status: 500 });
  }
}
