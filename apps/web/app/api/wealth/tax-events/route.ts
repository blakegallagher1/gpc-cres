import { NextRequest, NextResponse } from "next/server";
import {
  WealthTaxEventRouteError,
  createWealthTaxEvent,
  listWealthTaxEvents,
} from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";

export async function GET(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const eventType = searchParams.get("eventType");
  const status = searchParams.get("status");

  try {
    const data = await listWealthTaxEvents(auth.orgId, { eventType, status });
    return NextResponse.json(data);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.wealth.tax-events", method: "GET" },
    });
    return NextResponse.json({ error: "Failed to load tax events" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const data = await createWealthTaxEvent(auth.orgId, body);
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof WealthTaxEventRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    Sentry.captureException(error, {
      tags: { route: "api.wealth.tax-events", method: "POST" },
    });
    return NextResponse.json({ error: "Failed to create tax event" }, { status: 500 });
  }
}
