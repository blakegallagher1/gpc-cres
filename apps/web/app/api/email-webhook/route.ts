import crypto from "node:crypto";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
  ingestInboundEmail,
  resolveOrgFromRecipient,
  type IngestInboundEmailInput,
} from "@gpc/server/services/email-ingest.service";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * MOAT-P4-001 — Email ingestion webhook.
 *
 * Accepts a generic normalized payload shape (SendGrid/Postmark/Mailgun can
 * be mapped upstream to match). Authenticates via `EMAIL_WEBHOOK_TOKEN` bearer
 * token using timingSafeEqual to avoid length-based timing leaks.
 *
 * Determines `orgId` by:
 *  1) explicit `X-GPC-Org-Id` header (trusted path for internal mail relays);
 *  2) domain match of `toAddress` against `Jurisdiction.officialDomains`;
 *  3) null — email still stored for manual triage.
 */

interface WebhookBody {
  source?: unknown;
  fromAddress?: unknown;
  toAddress?: unknown;
  subject?: unknown;
  bodyText?: unknown;
  bodyHtml?: unknown;
  messageId?: unknown;
  headers?: unknown;
}

function verifyBearerToken(request: Request): boolean {
  const expected = (process.env.EMAIL_WEBHOOK_TOKEN || "").trim();
  if (!expected) return false;
  const header =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!header || header.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(header));
  } catch {
    return false;
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asStringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function isTrustedHeaderOrg(orgId: string): boolean {
  const raw = process.env.EMAIL_WEBHOOK_TRUSTED_ORG_IDS;
  if (!raw) return false;
  const allowed = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return allowed.includes("*") || allowed.includes(orgId);
}

export async function POST(request: Request) {
  if (!verifyBearerToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: WebhookBody | null = null;
  try {
    body = (await request.json()) as WebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body) {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }

  const source = asString(body.source);
  const fromAddress = asString(body.fromAddress);
  const toAddress = asString(body.toAddress);
  const subject = asString(body.subject);
  const bodyText = asStringOrEmpty(body.bodyText);

  const missing: string[] = [];
  if (!source) missing.push("source");
  if (!fromAddress) missing.push("fromAddress");
  if (!toAddress) missing.push("toAddress");
  if (!subject) missing.push("subject");
  if (!bodyText) missing.push("bodyText");
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Missing required fields", fields: missing },
      { status: 400 },
    );
  }

  // Resolve org: trusted header first, then domain match, then null (manual triage).
  const headerOrgId = request.headers.get("x-gpc-org-id")?.trim() || null;
  let orgId: string | null = headerOrgId && isTrustedHeaderOrg(headerOrgId) ? headerOrgId : null;
  if (!orgId && toAddress) {
    try {
      orgId = await resolveOrgFromRecipient(toAddress);
    } catch (err) {
      Sentry.captureException(err, {
        tags: { route: "api.email-webhook", step: "resolveOrg" },
      });
      orgId = null;
    }
  }

  const input: IngestInboundEmailInput = {
    orgId,
    source: source as string,
    fromAddress: fromAddress as string,
    toAddress: toAddress as string,
    subject: subject as string,
    bodyText,
    bodyHtml: asString(body.bodyHtml),
    messageId: asString(body.messageId),
    rawHeaders: asRecord(body.headers),
  };

  try {
    const result = await ingestInboundEmail(input);
    return NextResponse.json({
      ok: true,
      inboundEmailId: result.inboundEmailId,
      dealId: result.dealId,
      status: result.status,
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "api.email-webhook", method: "POST" },
    });
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Ingest failed",
      },
      { status: 500 },
    );
  }
}
