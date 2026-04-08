import { NextRequest, NextResponse } from "next/server";
import {
  EntityNotFoundError,
  EntityValidationError,
  deleteEntity,
  getEntity,
  updateEntity,
} from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const entity = await getEntity(auth.orgId, id);

  if (!entity) return NextResponse.json({ error: "Entity not found" }, { status: 404 });

  return NextResponse.json({ entity });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const body = await request.json();
    const entity = await updateEntity(auth.orgId, id, body);

    return NextResponse.json({ entity });
  } catch (error) {
    if (error instanceof EntityValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof EntityNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    Sentry.captureException(error, {
      tags: { route: "api.entities", method: "PATCH" },
    });
    console.error("Error updating entity:", error);
    return NextResponse.json({ error: "Failed to update entity" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    await deleteEntity(auth.orgId, id);
  } catch (error) {
    if (error instanceof EntityNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }

  return NextResponse.json({ success: true });
}
