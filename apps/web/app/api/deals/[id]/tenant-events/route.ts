import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";

import {
  AssetManagementAccessError,
  TENANT_EVENT_TYPES,
  createTenantChangeEvent,
  listTenantChangeEvents,
  type TenantEventType,
} from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const paramsSchema = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  tenantId: z.string().uuid().nullable().optional(),
  eventType: z.enum(
    TENANT_EVENT_TYPES as unknown as [TenantEventType, ...TenantEventType[]],
  ),
  eventDate: z.string().min(1),
  rentDelta: z.number().nullable().optional(),
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
    const events = await listTenantChangeEvents(auth.orgId, parsed.data.id);
    return NextResponse.json({ events });
  } catch (error) {
    if (error instanceof AssetManagementAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.tenantEvents", method: "GET" },
    });
    return NextResponse.json(
      { error: "Failed to load tenant events" },
      { status: 500 },
    );
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
        { error: "Invalid tenant event payload", issues: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const event = await createTenantChangeEvent({
      orgId: auth.orgId,
      dealId: parsed.data.id,
      tenantId: payload.tenantId ?? null,
      eventType: payload.eventType,
      eventDate: payload.eventDate,
      rentDelta: payload.rentDelta ?? null,
      notes: payload.notes ?? null,
    });
    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    if (error instanceof AssetManagementAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.tenantEvents", method: "POST" },
    });
    return NextResponse.json(
      { error: "Failed to create tenant event" },
      { status: 500 },
    );
  }
}
