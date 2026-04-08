import { NextRequest, NextResponse } from "next/server";
import { authorizeApiRoute } from "@/lib/auth/authorizeApiRoute";
import { findKnowledgeRow, deleteKnowledgeRow } from "@gpc/server/admin/knowledge.service";

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
  const { orgId } = authorization.auth;
  const { id } = await params;

  const found = await findKnowledgeRow(id, orgId);
  if (!found) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await deleteKnowledgeRow(id, orgId);
  return NextResponse.json({ success: true });
}
