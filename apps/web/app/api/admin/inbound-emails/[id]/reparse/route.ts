import { NextResponse, type NextRequest } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  reparseInboundEmail,
  getInboundEmailOrg,
} from "@gpc/server/services/email-ingest.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const existing = await getInboundEmailOrg(id);
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
