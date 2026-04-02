import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { authorizeApiRoute } from "@/lib/auth/authorizeApiRoute";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await authorizeApiRoute(request, request.nextUrl.pathname);
  if (!authorization.ok || !authorization.auth) {
    return authorization.ok
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : authorization.response;
  }
  const auth = authorization.auth;
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
