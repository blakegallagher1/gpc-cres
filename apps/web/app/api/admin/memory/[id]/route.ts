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

  const record = await prisma.memoryVerified.findFirst({
    where: { id, orgId: auth.orgId },
  });

  if (!record) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.memoryVerified.deleteMany({ where: { id, orgId: auth.orgId } });

  return NextResponse.json({ success: true });
}
