import { prisma } from "@entitlement-os/db";
import { AUTOMATION_CONFIG } from "./config";
import { createAutomationTask } from "./notifications";
import type { AutomationEvent } from "./events";

/**
 * #1 Deal Intake: Process incoming property inquiries and auto-create deals.
 *
 * Triggered by: intake.received event
 *
 * Actions:
 *   1. Parse incoming content for property details (address, parish, SKU signals)
 *   2. Check if content matches GPC criteria (covered parishes, target SKUs)
 *   3. Check daily auto-creation rate limit
 *   4. Auto-create deal in INTAKE status with 24h veto window
 *   5. Attach veto task — human can KILL the deal within 24h
 *
 * Guardrails:
 *   - 24-hour veto window: task with dueAt = now + 24h
 *   - Max auto-created deals per day rate limit (10)
 *   - Only creates deal when content matches GPC criteria
 *   - Non-matching intakes logged and skipped (no deal created)
 *   - Duplicate detection: skip if address matches existing deal
 */

/**
 * Simple content parser to extract property signals from unstructured text.
 */
export function parseIntakeContent(content: string): {
  addresses: string[];
  parishes: string[];
  skuSignals: string[];
  acreageMentions: string[];
  priceMentions: string[];
} {
  const addresses: string[] = [];
  const parishes: string[] = [];
  const skuSignals: string[] = [];
  const acreageMentions: string[] = [];
  const priceMentions: string[] = [];

  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Address patterns: street number + street name + suffix
    const addressMatch = trimmed.match(/\d+\s+[A-Za-z]+(?:\s+[A-Za-z]+)*\s+(?:St|Ave|Rd|Dr|Blvd|Ln|Way|Ct|Pkwy|Hwy|Road|Street|Avenue|Drive|Boulevard|Lane)/i);
    if (addressMatch) {
      addresses.push(addressMatch[0]);
    }

    // Parish detection
    for (const parish of AUTOMATION_CONFIG.intake.coveredParishes) {
      if (trimmed.toLowerCase().includes(parish.toLowerCase())) {
        if (!parishes.includes(parish)) {
          parishes.push(parish);
        }
      }
    }

    // SKU signals
    if (/outdoor\s*storage|yard\s*storage|equipment\s*yard|lay-?down\s*yard/i.test(trimmed)) {
      if (!skuSignals.includes("OUTDOOR_STORAGE")) skuSignals.push("OUTDOOR_STORAGE");
    }
    if (/truck\s*parking|truck\s*terminal|truck\s*lot|cdl|18[\s-]*wheel/i.test(trimmed)) {
      if (!skuSignals.includes("TRUCK_PARKING")) skuSignals.push("TRUCK_PARKING");
    }
    if (/flex\s*space|small\s*bay|warehouse|industrial\s*flex|light\s*industrial/i.test(trimmed)) {
      if (!skuSignals.includes("SMALL_BAY_FLEX")) skuSignals.push("SMALL_BAY_FLEX");
    }

    // Acreage mentions
    const acreMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*(?:acres?|ac\b)/i);
    if (acreMatch) {
      acreageMentions.push(acreMatch[0]);
    }

    // Price mentions
    const priceMatch = trimmed.match(/\$[\d,]+(?:\.\d{2})?(?:\s*(?:k|K|M|m|per\s*(?:acre|sf|sqft)))?/);
    if (priceMatch) {
      priceMentions.push(priceMatch[0]);
    }
  }

  return { addresses, parishes, skuSignals, acreageMentions, priceMentions };
}

/**
 * Check if parsed content matches GPC's investment criteria.
 */
export function matchesGpcCriteria(parsed: ReturnType<typeof parseIntakeContent>): {
  matches: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  if (parsed.parishes.length === 0) {
    reasons.push("No covered parish detected");
  } else {
    reasons.push(`Parish: ${parsed.parishes.join(", ")}`);
  }

  if (parsed.skuSignals.length === 0) {
    reasons.push("No target SKU signal (outdoor storage, truck parking, flex space)");
  } else {
    reasons.push(`SKU signal: ${parsed.skuSignals.join(", ")}`);
  }

  const matches = parsed.parishes.length > 0 && parsed.skuSignals.length > 0;
  return { matches, reasons };
}

/**
 * Handle intake.received events.
 */
export async function handleIntakeReceived(
  event: AutomationEvent
): Promise<void> {
  if (event.type !== "intake.received") return;

  const { source, content, orgId } = event;

  if (!content || content.trim().length === 0) return;

  // Parse the content
  const parsed = parseIntakeContent(content);

  // Check GPC criteria
  const criteria = matchesGpcCriteria(parsed);

  if (!criteria.matches) {
    console.log(
      `[automation] Intake from "${source}" does not match GPC criteria: ${criteria.reasons.filter((r) => r.startsWith("No")).join("; ")}`
    );
    return;
  }

  // Check daily rate limit
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayCount = await prisma.deal.count({
    where: {
      orgId,
      source: { startsWith: "[AUTO]" },
      createdAt: { gte: today },
    },
  });

  if (todayCount >= AUTOMATION_CONFIG.intake.maxAutoCreatedPerDay) {
    console.log(
      `[automation] Daily auto-intake limit (${AUTOMATION_CONFIG.intake.maxAutoCreatedPerDay}) reached. Skipping intake from "${source}".`
    );
    return;
  }

  // Duplicate detection: check if address matches existing deal
  if (parsed.addresses.length > 0) {
    const existingDeal = await prisma.deal.findFirst({
      where: {
        orgId,
        parcels: {
          some: {
            address: { contains: parsed.addresses[0], mode: "insensitive" },
          },
        },
      },
      select: { id: true, name: true },
    });

    if (existingDeal) {
      console.log(
        `[automation] Intake from "${source}" matches existing deal "${existingDeal.name}" (${existingDeal.id}). Skipping.`
      );
      return;
    }
  }

  // Find jurisdiction by parish name
  const parish = parsed.parishes[0];
  const jurisdiction = await prisma.jurisdiction.findFirst({
    where: {
      orgId,
      name: { contains: parish, mode: "insensitive" },
    },
    select: { id: true, name: true },
  });

  if (!jurisdiction) {
    console.log(
      `[automation] No jurisdiction found for parish "${parish}" in org ${orgId}. Cannot auto-create deal.`
    );
    return;
  }

  // Get the org creator (first admin user) for createdBy
  const orgMember = await prisma.orgMembership.findFirst({
    where: { orgId },
    select: { userId: true },
    orderBy: { createdAt: "asc" },
  });

  if (!orgMember) return;

  // Build deal name from address or source
  const dealName = parsed.addresses.length > 0
    ? parsed.addresses[0]
    : `${source} intake — ${parish}`;

  const sku = parsed.skuSignals[0] as "SMALL_BAY_FLEX" | "OUTDOOR_STORAGE" | "TRUCK_PARKING";

  // Auto-create deal
  const deal = await prisma.deal.create({
    data: {
      orgId,
      name: dealName,
      sku,
      jurisdictionId: jurisdiction.id,
      status: "INTAKE",
      source: `[AUTO] ${source}`,
      notes: `Auto-created from ${source}.\n\n${content.slice(0, 1000)}`,
      createdBy: orgMember.userId,
    },
  });

  // Create first parcel if we have an address
  if (parsed.addresses.length > 0) {
    await prisma.parcel.create({
      data: {
        orgId,
        dealId: deal.id,
        address: parsed.addresses[0],
      },
    });
  }

  // Create 24h veto task
  const vetoDeadline = new Date();
  vetoDeadline.setHours(
    vetoDeadline.getHours() + AUTOMATION_CONFIG.intake.vetoWindowHours
  );

  await createAutomationTask({
    orgId,
    dealId: deal.id,
    type: "enrichment_review",
    title: `Review auto-created deal from ${source}`,
    description: [
      `This deal was auto-created from an incoming ${source} inquiry.`,
      "",
      `**Parish:** ${parish}`,
      `**SKU:** ${sku}`,
      parsed.addresses.length > 0 ? `**Address:** ${parsed.addresses.join("; ")}` : "",
      parsed.acreageMentions.length > 0 ? `**Acreage:** ${parsed.acreageMentions.join(", ")}` : "",
      parsed.priceMentions.length > 0 ? `**Price:** ${parsed.priceMentions.join(", ")}` : "",
      "",
      `**Veto deadline:** ${vetoDeadline.toLocaleString()}`,
      "If this deal should not exist, change its status to KILLED before the deadline.",
    ].filter(Boolean).join("\n"),
    pipelineStep: 1,
    dueAt: vetoDeadline,
  });

  console.log(
    `[automation] Auto-created deal "${deal.name}" (${deal.id}) from ${source} intake. 24h veto window.`
  );
}
