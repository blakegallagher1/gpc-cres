import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await resolveAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = await context.params;
  const id = params.id;

  try {
    const deleted = await prisma.$executeRaw`
      delete from saved_geofences
      where id = ${id}::uuid and org_id = ${auth.orgId}::uuid
    `;

    if (Number(deleted) === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[geofences-delete]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
