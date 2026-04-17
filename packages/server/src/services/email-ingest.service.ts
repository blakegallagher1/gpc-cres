import { prisma, Prisma } from "@entitlement-os/db";
import { logger } from "../logger";
import { parseInboundEmail, type ParsedEmailFields } from "./email-parser.service";

/**
 * MOAT-P4-001 — email-to-deal ingestion pipeline.
 *
 * Accepts a normalized inbound email payload, persists it to `inbound_emails`
 * (audit log), runs the regex-based parser, and, when enough signal is
 * present, creates a skeleton Deal via direct Prisma insert so a human analyst
 * can pick it up and complete triage.
 *
 * Design choices:
 * - Deal insert is done directly (not via deal.service.createDeal) because:
 *   1) ingestion has no authenticated user — we use a synthetic "system"
 *      createdBy when possible, falling back to org-first membership;
 *   2) we deliberately skip workflow-state compatibility projections: the
 *      analyst will set SKU/strategy/stage when they triage the email;
 *   3) we need to tolerate missing jurisdiction (the org's first jurisdiction
 *      is used as the skeleton placeholder).
 * - If required context (org, jurisdiction, or a parseable address) is missing,
 *   the email is persisted with `parseStatus="skipped"` and no deal is created.
 * - Re-parse support: `reparseInboundEmail` lets operators rerun the parser on
 *   an existing row after improving heuristics.
 */

export interface IngestInboundEmailInput {
  orgId: string | null;
  source: string;
  fromAddress: string;
  toAddress: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  messageId?: string | null;
  rawHeaders?: Record<string, unknown>;
}

export type InboundEmailParseStatus = "pending" | "parsed" | "failed" | "skipped";

export interface IngestInboundEmailResult {
  inboundEmailId: string;
  dealId: string | null;
  status: InboundEmailParseStatus;
  parsedFields: ParsedEmailFields;
}

function hasMinimumSignal(parsed: ParsedEmailFields): boolean {
  let count = 0;
  if (parsed.propertyAddress) count += 1;
  if (parsed.askPrice !== null) count += 1;
  if (parsed.acreage !== null) count += 1;
  if (parsed.brokerEmail) count += 1;
  if (parsed.brokerName) count += 1;
  return count >= 2 && Boolean(parsed.propertyAddress);
}

async function resolveSystemUserForOrg(orgId: string): Promise<string | null> {
  const membership = await prisma.orgMembership.findFirst({
    where: { orgId },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  return membership?.userId ?? null;
}

async function resolveDefaultJurisdiction(orgId: string): Promise<string | null> {
  const jurisdiction = await prisma.jurisdiction.findFirst({
    where: { orgId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return jurisdiction?.id ?? null;
}

function deriveDealName(parsed: ParsedEmailFields, subject: string): string {
  if (parsed.propertyAddress) {
    return parsed.propertyAddress.slice(0, 120);
  }
  const trimmed = subject.trim();
  if (trimmed) {
    return trimmed.slice(0, 120);
  }
  return "Inbound broker submission";
}

async function createSkeletonDeal(params: {
  orgId: string;
  parsed: ParsedEmailFields;
  subject: string;
}): Promise<string | null> {
  const { orgId, parsed, subject } = params;

  const [createdBy, jurisdictionId] = await Promise.all([
    resolveSystemUserForOrg(orgId),
    resolveDefaultJurisdiction(orgId),
  ]);

  if (!createdBy || !jurisdictionId) {
    logger.warn(
      "email-ingest: cannot create skeleton deal — missing org creator or jurisdiction",
      { orgId, hasCreator: Boolean(createdBy), hasJurisdiction: Boolean(jurisdictionId) },
    );
    return null;
  }

  const name = deriveDealName(parsed, subject);
  const notesLines: string[] = [
    "Skeleton deal auto-created from inbound email.",
    `Subject: ${subject || "(no subject)"}`,
  ];
  if (parsed.askPrice !== null) {
    notesLines.push(`Asking price (parsed): $${parsed.askPrice.toLocaleString("en-US")}`);
  }
  if (parsed.acreage !== null) {
    notesLines.push(`Acreage (parsed): ${parsed.acreage}`);
  }
  if (parsed.brokerName || parsed.brokerCompany || parsed.brokerEmail || parsed.brokerPhone) {
    notesLines.push(
      `Broker: ${[parsed.brokerName, parsed.brokerCompany, parsed.brokerEmail, parsed.brokerPhone]
        .filter((v): v is string => Boolean(v))
        .join(" · ")}`,
    );
  }

  const deal = await prisma.deal.create({
    data: {
      orgId,
      name,
      sku: "SMALL_BAY_FLEX", // legacy-compat default; analyst will correct
      legacySku: "SMALL_BAY_FLEX",
      jurisdictionId,
      status: "INTAKE",
      legacyStatus: "INTAKE",
      dealSourceType: "BROKER",
      currentStageKey: "ORIGINATION",
      notes: notesLines.join("\n"),
      createdBy,
    },
    select: { id: true },
  });

  if (parsed.propertyAddress) {
    await prisma.parcel
      .create({
        data: {
          orgId,
          dealId: deal.id,
          address: parsed.propertyAddress,
          apn: null,
        },
      })
      .catch((err) => {
        logger.warn("email-ingest: failed to attach skeleton parcel", {
          dealId: deal.id,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      });
  }

  return deal.id;
}

export async function ingestInboundEmail(
  input: IngestInboundEmailInput,
): Promise<IngestInboundEmailResult> {
  const parsed = parseInboundEmail({
    subject: input.subject,
    body: input.bodyText,
    from: input.fromAddress,
  });

  let status: InboundEmailParseStatus;
  let dealId: string | null = null;
  let parseError: string | null = null;

  if (!input.orgId) {
    status = "skipped";
  } else if (!hasMinimumSignal(parsed)) {
    status = "skipped";
  } else {
    try {
      dealId = await createSkeletonDeal({
        orgId: input.orgId,
        parsed,
        subject: input.subject,
      });
      status = dealId ? "parsed" : "skipped";
    } catch (err) {
      logger.error("email-ingest: skeleton deal creation failed", {
        orgId: input.orgId,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      status = "failed";
      parseError = err instanceof Error ? err.message : "unknown error";
    }
  }

  const record = await prisma.inboundEmail.create({
    data: {
      orgId: input.orgId,
      source: input.source,
      fromAddress: input.fromAddress,
      toAddress: input.toAddress,
      subject: input.subject,
      bodyText: input.bodyText,
      bodyHtml: input.bodyHtml ?? null,
      messageId: input.messageId ?? null,
      parsedAt: new Date(),
      parsedDealId: dealId,
      parseStatus: status,
      parseError,
      parsedFields: parsed as unknown as Prisma.InputJsonValue,
      rawHeaders: (input.rawHeaders ?? {}) as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  return {
    inboundEmailId: record.id,
    dealId,
    status,
    parsedFields: parsed,
  };
}

export async function reparseInboundEmail(inboundEmailId: string): Promise<IngestInboundEmailResult> {
  const existing = await prisma.inboundEmail.findUnique({
    where: { id: inboundEmailId },
    select: {
      id: true,
      orgId: true,
      subject: true,
      bodyText: true,
      fromAddress: true,
      parsedDealId: true,
    },
  });

  if (!existing) {
    throw new Error("Inbound email not found");
  }

  const parsed = parseInboundEmail({
    subject: existing.subject,
    body: existing.bodyText,
    from: existing.fromAddress,
  });

  let status: InboundEmailParseStatus;
  let dealId: string | null = existing.parsedDealId;
  let parseError: string | null = null;

  if (!existing.orgId) {
    status = "skipped";
  } else if (existing.parsedDealId) {
    // Already linked — don't create a second deal, just refresh parsed fields.
    status = "parsed";
  } else if (!hasMinimumSignal(parsed)) {
    status = "skipped";
  } else {
    try {
      dealId = await createSkeletonDeal({
        orgId: existing.orgId,
        parsed,
        subject: existing.subject,
      });
      status = dealId ? "parsed" : "skipped";
    } catch (err) {
      status = "failed";
      parseError = err instanceof Error ? err.message : "unknown error";
    }
  }

  await prisma.inboundEmail.update({
    where: { id: inboundEmailId },
    data: {
      parsedAt: new Date(),
      parsedDealId: dealId,
      parseStatus: status,
      parseError,
      parsedFields: parsed as unknown as Prisma.InputJsonValue,
    },
  });

  return { inboundEmailId, dealId, status, parsedFields: parsed };
}

export interface InboundEmailListItem {
  id: string;
  source: string;
  fromAddress: string;
  toAddress: string;
  subject: string;
  receivedAt: string;
  parsedAt: string | null;
  parseStatus: InboundEmailParseStatus;
  parseError: string | null;
  parsedDealId: string | null;
  parsedDealName: string | null;
  parsedFields: ParsedEmailFields | null;
}

export interface ListInboundEmailsOptions {
  orgId: string;
  status?: InboundEmailParseStatus;
  limit?: number;
}

export async function listInboundEmails(
  options: ListInboundEmailsOptions,
): Promise<InboundEmailListItem[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const rows = await prisma.inboundEmail.findMany({
    where: {
      orgId: options.orgId,
      ...(options.status ? { parseStatus: options.status } : {}),
    },
    orderBy: { receivedAt: "desc" },
    take: limit,
  });

  // Enrich with deal names where available.
  const dealIds = Array.from(
    new Set(rows.map((row) => row.parsedDealId).filter((id): id is string => Boolean(id))),
  );
  const deals = dealIds.length
    ? await prisma.deal.findMany({
        where: { id: { in: dealIds }, orgId: options.orgId },
        select: { id: true, name: true },
      })
    : [];
  const dealNameById = new Map(deals.map((d) => [d.id, d.name]));

  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    fromAddress: row.fromAddress,
    toAddress: row.toAddress,
    subject: row.subject,
    receivedAt: row.receivedAt.toISOString(),
    parsedAt: row.parsedAt ? row.parsedAt.toISOString() : null,
    parseStatus: row.parseStatus as InboundEmailParseStatus,
    parseError: row.parseError,
    parsedDealId: row.parsedDealId,
    parsedDealName: row.parsedDealId ? dealNameById.get(row.parsedDealId) ?? null : null,
    parsedFields:
      row.parsedFields && typeof row.parsedFields === "object"
        ? (row.parsedFields as unknown as ParsedEmailFields)
        : null,
  }));
}

export async function findInboundEmailByDealId(
  orgId: string,
  dealId: string,
): Promise<InboundEmailListItem | null> {
  const row = await prisma.inboundEmail.findFirst({
    where: { orgId, parsedDealId: dealId },
    orderBy: { receivedAt: "desc" },
  });
  if (!row) return null;

  return {
    id: row.id,
    source: row.source,
    fromAddress: row.fromAddress,
    toAddress: row.toAddress,
    subject: row.subject,
    receivedAt: row.receivedAt.toISOString(),
    parsedAt: row.parsedAt ? row.parsedAt.toISOString() : null,
    parseStatus: row.parseStatus as InboundEmailParseStatus,
    parseError: row.parseError,
    parsedDealId: row.parsedDealId,
    parsedDealName: null,
    parsedFields:
      row.parsedFields && typeof row.parsedFields === "object"
        ? (row.parsedFields as unknown as ParsedEmailFields)
        : null,
  };
}

/**
 * Resolve an orgId from a recipient `toAddress` by matching the domain against
 * any jurisdiction's `officialDomains` array OR by exact membership in a
 * known lookup table. Falls back to null if no match.
 *
 * This is a deliberately narrow/soft resolver — the webhook caller can also
 * pass an explicit `X-GPC-Org-Id` header if domain matching is insufficient.
 */
export async function resolveOrgFromRecipient(toAddress: string): Promise<string | null> {
  const at = toAddress.lastIndexOf("@");
  if (at === -1) return null;
  const domain = toAddress.slice(at + 1).trim().toLowerCase();
  if (!domain) return null;

  const jurisdiction = await prisma.jurisdiction.findFirst({
    where: {
      officialDomains: { has: domain },
    },
    select: { orgId: true },
  });
  return jurisdiction?.orgId ?? null;
}
