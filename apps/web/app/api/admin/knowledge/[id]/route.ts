import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  // Verify ownership via org_id before deleting
  const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM knowledge_embeddings WHERE id = $1::uuid AND org_id = $2::uuid`,
    id,
    auth.orgId
  );

  if (existing.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.$queryRawUnsafe(
    `DELETE FROM knowledge_embeddings WHERE id = $1::uuid AND org_id = $2::uuid`,
    id,
    auth.orgId
  );

  return NextResponse.json({ success: true });
}
