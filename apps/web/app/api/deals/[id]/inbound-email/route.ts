import { NextResponse, type NextRequest } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { findInboundEmailByDealId } from "@gpc/server/services/email-ingest.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MOAT-P4-001 — Returns the inbound email (if any) that originated the deal.
 * Used by the deal detail page to render the "Originated from email" badge.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const inboundEmail = await findInboundEmailByDealId(auth.orgId, id);

  if (!inboundEmail) {
    return NextResponse.json({ email: null });
  }

  return NextResponse.json({
    email: {
      id: inboundEmail.id,
      subject: inboundEmail.subject,
      fromAddress: inboundEmail.fromAddress,
      receivedAt: inboundEmail.receivedAt,
      parseStatus: inboundEmail.parseStatus,
    },
  });
}
