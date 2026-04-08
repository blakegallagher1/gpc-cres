import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
  deleteGeofence,
  GeofenceNotFoundError,
} from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    await deleteGeofence({ orgId: auth.orgId, geofenceId: id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.geofences.[id]", method: "DELETE" },
    });
    if (error instanceof GeofenceNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
