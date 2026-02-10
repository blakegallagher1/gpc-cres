import { prisma } from "@entitlement-os/db";
import { AUTOMATION_CONFIG } from "./config";
import { createAutomationTask } from "./notifications";
import type { AutomationEvent } from "./events";

/**
 * #3 Auto-Triage: Detect when a deal is ready for triage and create a notification.
 *
 * Triggered by: parcel.enriched event
 * Checks:
 *   1. Deal is in INTAKE status
 *   2. ALL parcels have propertyDbId (enriched)
 *   3. No successful triage run exists for this deal
 *   4. Daily rate limit not exceeded
 *
 * When conditions met: creates "[AUTO] Deal ready for triage" task.
 * Following "agents advise, humans decide" — we suggest triage, not force it.
 */
export async function handleTriageReadiness(
  event: AutomationEvent
): Promise<void> {
  if (event.type !== "parcel.enriched") return;

  const { dealId, orgId } = event;

  // Load deal with parcels
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, orgId },
    include: { parcels: true },
  });

  if (!deal) return;
  if (deal.status !== "INTAKE") return;
  if (deal.parcels.length === 0) return;

  // Check all parcels are enriched
  const allEnriched = deal.parcels.every((p) => p.propertyDbId !== null);
  if (!allEnriched) return;

  // Check no successful triage run exists
  const existingRun = await prisma.run.findFirst({
    where: {
      dealId,
      orgId,
      runType: "TRIAGE",
      status: "succeeded",
    },
  });
  if (existingRun) return;

  // Check daily rate limit
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayRunCount = await prisma.run.count({
    where: {
      dealId,
      orgId,
      runType: "TRIAGE",
      startedAt: { gte: today },
    },
  });
  if (todayRunCount >= AUTOMATION_CONFIG.triage.maxRunsPerDealPerDay) return;

  // Check if we already created a "ready for triage" task for this deal
  const existingTask = await prisma.task.findFirst({
    where: {
      dealId,
      orgId,
      title: { contains: "ready for triage" },
      status: { in: ["TODO", "IN_PROGRESS"] },
    },
  });
  if (existingTask) return;

  // All conditions met — create notification task
  const unenrichedCount = deal.parcels.filter((p) => !p.propertyDbId).length;
  await createAutomationTask({
    orgId,
    dealId,
    type: "enrichment_review",
    title: "Deal ready for triage",
    description: `All ${deal.parcels.length} parcel(s) enriched (${unenrichedCount} unenriched). Deal "${deal.name}" is ready for triage scoring. Click "Run Triage" to proceed.`,
    pipelineStep: 1,
  });
}
