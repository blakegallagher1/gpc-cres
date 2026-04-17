import { NextResponse, type NextRequest } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { prisma } from "@entitlement-os/db";
import { reparseInboundEmail } from "@gpc/server/services/email-ingest.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MOAT-P4-001 — Re-run parser on an existing inbound email row.
 *
 * Useful after improving regex heuristics or when an email was received before
 * the org/jurisdiction was configured.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  // Org-scope check: only allow reparsing emails from the caller's org
  // (or unassigned emails that have no orgId).
  const existing = await prisma.inboundEmail.findUnique({
    where: { id },
    select: { id: true, orgId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.orgId && existing.orgId !== auth.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await reparseInboundEmail(id);
    return NextResponse.json({
      ok: true,
      inboundEmailId: result.inboundEmailId,
      dealId: result.dealId,
      status: result.status,
      parsedFields: result.parsedFields,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Reparse failed",
      },
      { status: 500 },
    );
  }
}
