import { prisma } from "@entitlement-os/db";

import { logger } from "../logger";
import { AUTOMATION_CONFIG } from "./config";
import {
  getAutomationDealContext,
  getCurrentWorkflowStage,
  getWorkflowPipelineStep,
} from "./context";
import { createAutomationTask } from "./notifications";
import type { AutomationEvent } from "./types";

export async function findMatchingBuyers(
  orgId: string,
  sku: string,
  jurisdictionId: string,
): Promise<
  Array<{
    id: string;
    name: string;
    company: string | null;
    email: string | null;
    buyerType: string;
  }>
> {
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
    take: 100,
  });

  return buyers;
}

async function weeklyOutreachCount(
  dealId: string,
  orgId: string,
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

async function loadBuyerEligibilityState(
  buyerIds: string[],
  dealId: string,
  orgId: string,
): Promise<{
  coolOffBuyerIds: Set<string>;
  contactedBuyerIds: Set<string>;
}> {
  if (buyerIds.length === 0) {
    return {
      coolOffBuyerIds: new Set<string>(),
      contactedBuyerIds: new Set<string>(),
    };
  }

  const coolOffDate = new Date();
  coolOffDate.setDate(
    coolOffDate.getDate() - AUTOMATION_CONFIG.buyerOutreach.coolOffDays,
  );

  const [recentOutreach, existingOutreach] = await Promise.all([
    prisma.outreach.findMany({
      where: {
        orgId,
        buyerId: { in: buyerIds },
        lastContactAt: { gte: coolOffDate },
      },
      select: { buyerId: true },
      distinct: ["buyerId"],
    }),
    prisma.outreach.findMany({
      where: {
        orgId,
        dealId,
        buyerId: { in: buyerIds },
      },
      select: { buyerId: true },
      distinct: ["buyerId"],
    }),
  ]);

  return {
    coolOffBuyerIds: new Set(recentOutreach.map((outreach) => outreach.buyerId)),
    contactedBuyerIds: new Set(existingOutreach.map((outreach) => outreach.buyerId)),
  };
}

export async function handleBuyerOutreach(
  event: AutomationEvent,
): Promise<void> {
  if (event.type !== "deal.statusChanged" && event.type !== "deal.stageChanged") {
    return;
  }

  const { dealId, orgId } = event;
  const context = await getAutomationDealContext(dealId, orgId);
  if (!context) return;

  if (event.type === "deal.statusChanged" && event.to !== "EXIT_MARKETED") {
    return;
  }
  if (event.type === "deal.stageChanged" && event.to !== "DISPOSITION") {
    return;
  }
  if (context.currentStageKey !== "DISPOSITION") {
    return;
  }

  const currentStage = getCurrentWorkflowStage(context);
  const pipelineStep = currentStage
    ? getWorkflowPipelineStep(context, currentStage.key)
    : 7;
  const triggerLabel = currentStage?.name ?? "Disposition";

  const weeklyCount = await weeklyOutreachCount(dealId, orgId);
  if (weeklyCount >= AUTOMATION_CONFIG.buyerOutreach.maxEmailsPerDealPerWeek) {
    logger.info("Automation buyer outreach skipped weekly limit", {
      dealId,
      orgId,
      limit: AUTOMATION_CONFIG.buyerOutreach.maxEmailsPerDealPerWeek,
    });
    return;
  }

  const matchedBuyers = await findMatchingBuyers(
    orgId,
    context.sku,
    context.jurisdictionId,
  );

  if (matchedBuyers.length === 0) {
    await createAutomationTask({
      orgId,
      dealId,
      type: "enrichment_review",
      title: "No matching buyers found",
      description: `Deal "${context.name}" (${context.sku}) reached ${triggerLabel} but no buyers match the SKU + jurisdiction criteria. Consider adding buyers or broadening search criteria.`,
      pipelineStep,
    });
    return;
  }

  const { coolOffBuyerIds, contactedBuyerIds } = await loadBuyerEligibilityState(
    matchedBuyers.map((buyer) => buyer.id),
    dealId,
    orgId,
  );
  const eligibleBuyers = matchedBuyers.filter(
    (buyer) =>
      !coolOffBuyerIds.has(buyer.id) && !contactedBuyerIds.has(buyer.id),
  );

  if (eligibleBuyers.length === 0) {
    logger.info("Automation buyer outreach skipped due to buyer eligibility", {
      dealId,
      matchedBuyerCount: matchedBuyers.length,
    });
    return;
  }

  const remainingCapacity =
    AUTOMATION_CONFIG.buyerOutreach.maxEmailsPerDealPerWeek - weeklyCount;
  const buyersToContact = eligibleBuyers.slice(0, remainingCapacity);
  const buyerList = buyersToContact
    .map(
      (buyer, index) =>
        `${index + 1}. **${buyer.name}**${buyer.company ? ` (${buyer.company})` : ""} — ${buyer.buyerType}${buyer.email ? ` — ${buyer.email}` : ""}`,
    )
    .join("\n");

  await createAutomationTask({
    orgId,
    dealId,
    type: "enrichment_review",
    title: `${buyersToContact.length} buyer outreach emails ready for review`,
    description: `Deal "${context.name}" (${context.sku}) is now in ${triggerLabel}. ${buyersToContact.length} eligible buyer(s) matched:\n\n${buyerList}\n\nTotal matched: ${matchedBuyers.length} | Eligible: ${eligibleBuyers.length} | This batch: ${buyersToContact.length}\n\nReview and draft personalized outreach for each buyer. Emails will NOT be sent automatically.`,
    pipelineStep,
  });
}

export async function handleTriageBuyerMatch(
  event: AutomationEvent,
): Promise<void> {
  if (event.type !== "triage.completed") return;
  if (event.decision !== "ADVANCE") return;

  const { dealId, orgId } = event;
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, orgId },
    select: { id: true, name: true, sku: true, jurisdictionId: true },
  });

  if (!deal) return;

  const matchedBuyers = await findMatchingBuyers(
    orgId,
    deal.sku,
    deal.jurisdictionId,
  );

  if (matchedBuyers.length === 0) {
    return;
  }

  const existingTask = await prisma.task.findFirst({
    where: {
      dealId,
      orgId,
      title: { contains: "buyer interest" },
      status: { in: ["TODO", "IN_PROGRESS"] },
    },
  });

  if (existingTask) {
    return;
  }

  await createAutomationTask({
    orgId,
    dealId,
    type: "enrichment_review",
    title: `${matchedBuyers.length} potential buyer(s) match this deal`,
    description: `Triage recommends ADVANCE for "${deal.name}" (${deal.sku}). ${matchedBuyers.length} buyer(s) in the database match this deal's SKU + jurisdiction. Consider early buyer interest outreach as the deal progresses through entitlements.`,
    pipelineStep: 1,
  });
}
