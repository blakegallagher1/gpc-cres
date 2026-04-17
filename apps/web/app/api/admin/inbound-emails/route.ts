import { NextResponse, type NextRequest } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  listInboundEmails,
  type InboundEmailParseStatus,
} from "@gpc/server/services/email-ingest.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: ReadonlyArray<InboundEmailParseStatus> = [
  "pending",
  "parsed",
  "failed",
  "skipped",
];

/**
 * MOAT-P4-001 — Admin inbound email browser.
 *
 * Returns recent inbound emails for the caller's org, optionally filtered by
 * `?status=pending|parsed|failed|skipped`, and capped at `?limit=50`.
 */
export async function GET(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const statusParam = request.nextUrl.searchParams.get("status");
  const status =
    statusParam && STATUSES.includes(statusParam as InboundEmailParseStatus)
      ? (statusParam as InboundEmailParseStatus)
      : undefined;

  const rawLimit = Number.parseInt(
    request.nextUrl.searchParams.get("limit") ?? "50",
    10,
  );
  const limit = Number.isFinite(rawLimit) ? rawLimit : 50;

  try {
    const emails = await listInboundEmails({
      orgId: auth.orgId,
      status,
      limit,
    });
    return NextResponse.json({ ok: true, emails });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to load inbound emails",
      },
      { status: 500 },
    );
  }
}
