import { NextRequest, NextResponse } from "next/server";
import { EntityNotFoundError, EntityValidationError, createEntity, listEntities } from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";

export async function GET(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const entities = await listEntities(auth.orgId);

    return NextResponse.json({ entities });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.entities", method: "GET" },
    });
    console.error("[Entities GET] Failed:", error);
    return NextResponse.json(
      { error: "Failed to load entities", entities: [] },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const entity = await createEntity(auth.orgId, body);

    return NextResponse.json({ entity }, { status: 201 });
  } catch (error) {
    if (error instanceof EntityValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof EntityNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    Sentry.captureException(error, {
      tags: { route: "api.entities", method: "POST" },
    });
    console.error("Error creating entity:", error);
    return NextResponse.json({ error: "Failed to create entity" }, { status: 500 });
  }
}
