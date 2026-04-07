import { NextRequest, NextResponse } from "next/server";
import { deleteVerifiedMemory } from "@gpc/server/admin/memory.service";
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

  const deleted = await deleteVerifiedMemory({ id, orgId: auth.orgId });
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
