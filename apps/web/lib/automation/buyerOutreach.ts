import { prisma } from "@entitlement-os/db";
import { AUTOMATION_CONFIG } from "./config";
import { createAutomationTask } from "./notifications";
import type { AutomationEvent } from "./events";

/**
 * #10 Buyer Outreach: Match buyers to deals and draft outreach suggestions.
 *
 * Triggered by: deal.statusChanged event (when deal reaches EXIT_MARKETED)
 * Also triggered by: triage.completed event (for early buyer matching at ADVANCE deals)
 *
 * Actions:
 *   - Match buyers by SKU interest + jurisdiction
 *   - Create notification task with matched buyer list
 *   - NEVER auto-send emails (neverAutoSend = true)
 *   - Rate limit: max emails per deal per week
 *   - Cool-off: don't contact same buyer too frequently
 */

/**
 * Find buyers matching a deal's SKU and jurisdiction.
 */
export async function findMatchingBuyers(
  orgId: string,
  sku: string,
  jurisdictionId: string
): Promise<Array<{ id: string; name: string; company: string | null; email: string | null; buyerType: string }>> {
  const buyers = await prisma.buyer.findMany({
    where: {
      orgId,
      skuInterests: { has: sku as never },
      jurisdictionInterests: { has: jurisdictionId },
    },
    select: {
      id: true,
      name: true,
      company: true,
      email: true,
      buyerType: true,
    },
  });

  return buyers;
}

/**
 * Check how many outreach emails have been sent for a deal this week.
 */
async function weeklyOutreachCount(
  dealId: string,
  orgId: string
): Promise<number> {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  return prisma.outreach.count({
    where: {
      dealId,
      orgId,
      status: { in: ["sent", "completed"] },
      lastContactAt: { gte: weekAgo },
    },
  });
}

/**
 * Check if a buyer is in cool-off period (contacted too recently).
 */
async function isInCoolOff(
  buyerId: string,
  orgId: string
): Promise<boolean> {
  const coolOffDate = new Date();
  coolOffDate.setDate(
    coolOffDate.getDate() - AUTOMATION_CONFIG.buyerOutreach.coolOffDays
  );

  const recentOutreach = await prisma.outreach.findFirst({
    where: {
      buyerId,
      orgId,
      lastContactAt: { gte: coolOffDate },
    },
  });

  return recentOutreach !== null;
}

/**
 * Check if a buyer has already been contacted about this specific deal.
 */
async function alreadyContacted(
  buyerId: string,
  dealId: string,
  orgId: string
): Promise<boolean> {
  const existing = await prisma.outreach.findFirst({
    where: { buyerId, dealId, orgId },
  });
  return existing !== null;
}

/**
 * Handle deal reaching EXIT_MARKETED — suggest buyer outreach.
 */
export async function handleBuyerOutreach(
  event: AutomationEvent
): Promise<void> {
  if (event.type !== "deal.statusChanged") return;
  if (event.to !== "EXIT_MARKETED") return;

  const { dealId, orgId } = event;

  // Load deal
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, orgId },
    select: { id: true, name: true, sku: true, jurisdictionId: true },
  });

  if (!deal) return;

  // Check weekly rate limit
  const weeklyCount = await weeklyOutreachCount(dealId, orgId);
  if (weeklyCount >= AUTOMATION_CONFIG.buyerOutreach.maxEmailsPerDealPerWeek) {
    console.log(
      `[automation] Weekly outreach limit (${AUTOMATION_CONFIG.buyerOutreach.maxEmailsPerDealPerWeek}) reached for deal ${dealId}`
    );
    return;
  }

  // Find matching buyers
  const matchedBuyers = await findMatchingBuyers(
    orgId,
    deal.sku,
    deal.jurisdictionId
  );

  if (matchedBuyers.length === 0) {
    await createAutomationTask({
      orgId,
      dealId,
      type: "enrichment_review",
      title: "No matching buyers found",
      description: `Deal "${deal.name}" (${deal.sku}) reached EXIT_MARKETED but no buyers match the SKU + jurisdiction criteria. Consider adding buyers or broadening search criteria.`,
      pipelineStep: 8,
    });
    return;
  }

  // Filter out buyers in cool-off or already contacted
  const eligibleBuyers: typeof matchedBuyers = [];

  for (const buyer of matchedBuyers) {
    const [coolOff, contacted] = await Promise.all([
      isInCoolOff(buyer.id, orgId),
      alreadyContacted(buyer.id, dealId, orgId),
    ]);

    if (!contacted && !coolOff) {
      eligibleBuyers.push(buyer);
    }
  }

  if (eligibleBuyers.length === 0) {
    console.log(
      `[automation] All ${matchedBuyers.length} matched buyers for deal ${dealId} are in cool-off or already contacted`
    );
    return;
  }

  // Remaining capacity
  const remainingCapacity =
    AUTOMATION_CONFIG.buyerOutreach.maxEmailsPerDealPerWeek - weeklyCount;
  const buyersToContact = eligibleBuyers.slice(0, remainingCapacity);

  // Build buyer summary
  const buyerList = buyersToContact
    .map(
      (b, i) =>
        `${i + 1}. **${b.name}**${b.company ? ` (${b.company})` : ""} — ${b.buyerType}${b.email ? ` — ${b.email}` : ""}`
    )
    .join("\n");

  // Create notification task — NEVER auto-send
  await createAutomationTask({
    orgId,
    dealId,
    type: "enrichment_review",
    title: `${buyersToContact.length} buyer outreach emails ready for review`,
    description: `Deal "${deal.name}" (${deal.sku}) is now EXIT_MARKETED. ${buyersToContact.length} eligible buyer(s) matched:\n\n${buyerList}\n\nTotal matched: ${matchedBuyers.length} | Eligible: ${eligibleBuyers.length} | This batch: ${buyersToContact.length}\n\nReview and draft personalized outreach for each buyer. Emails will NOT be sent automatically.`,
    pipelineStep: 8,
  });
}

/**
 * Handle triage.completed for early buyer interest flagging.
 * When triage decision is ADVANCE, check if any buyers match.
 */
export async function handleTriageBuyerMatch(
  event: AutomationEvent
): Promise<void> {
  if (event.type !== "triage.completed") return;
  if (event.decision !== "ADVANCE") return;

  const { dealId, orgId } = event;

  // Load deal
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, orgId },
    select: { id: true, name: true, sku: true, jurisdictionId: true },
  });

  if (!deal) return;

  // Quick check for matching buyers
  const matchedBuyers = await findMatchingBuyers(
    orgId,
    deal.sku,
    deal.jurisdictionId
  );

  if (matchedBuyers.length > 0) {
    // Check if we already flagged buyer interest for this deal
    const existingTask = await prisma.task.findFirst({
      where: {
        dealId,
        orgId,
        title: { contains: "buyer interest" },
        status: { in: ["TODO", "IN_PROGRESS"] },
      },
    });

    if (!existingTask) {
      await createAutomationTask({
        orgId,
        dealId,
        type: "enrichment_review",
        title: `${matchedBuyers.length} potential buyer(s) match this deal`,
        description: `Triage recommends ADVANCE for "${deal.name}" (${deal.sku}). ${matchedBuyers.length} buyer(s) in the database match this deal's SKU + jurisdiction. Consider early buyer interest outreach as the deal progresses through entitlements.`,
        pipelineStep: 1,
      });
    }
  }
}
