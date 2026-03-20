import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { ensureSavedGeofencesTable } from "@/lib/server/geofenceTable";
import * as Sentry from "@sentry/nextjs";

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await resolveAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = await context.params;
  const id = params.id;

  try {
    await ensureSavedGeofencesTable();
    const deleted = await prisma.$executeRaw`
      delete from saved_geofences
      where id = ${id}::uuid and org_id = ${auth.orgId}::uuid
    `;

    if (Number(deleted) === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.geofences", method: "DELETE" },
    });
    console.error("[geofences-delete]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
