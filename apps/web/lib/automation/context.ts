import { prisma } from "@entitlement-os/db";
import type {
  DealStageKey,
  DealStatus,
  DealStrategy,
  WorkflowTemplateKey,
} from "@entitlement-os/shared";
import {
  getFallbackWorkflowStages,
  resolveGeneralizedFieldsFromLegacySku,
  resolveStageKeyFromLegacyStatus,
} from "../../app/api/_lib/opportunityPhase3";

export type AutomationDealContext = {
  dealId: string;
  orgId: string;
  name: string;
  sku: string;
  jurisdictionId: string;
  status: DealStatus;
  strategy: DealStrategy | null;
  workflowTemplateKey: WorkflowTemplateKey | null;
  currentStageKey: DealStageKey;
  templateStages: Array<{
    key: DealStageKey;
    name: string;
    ordinal: number;
    description: string | null;
    requiredGate: string | null;
  }>;
};

export async function getAutomationDealContext(
  dealId: string,
  orgId: string,
): Promise<AutomationDealContext | null> {
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, orgId },
    select: {
      id: true,
      orgId: true,
      name: true,
      sku: true,
      jurisdictionId: true,
      status: true,
      legacySku: true,
      legacyStatus: true,
      strategy: true,
      workflowTemplateKey: true,
      currentStageKey: true,
    },
  });

  if (!deal) {
    return null;
  }

  const legacyFields = resolveGeneralizedFieldsFromLegacySku(deal.legacySku ?? deal.sku);
  const strategy = (deal.strategy ?? legacyFields.strategy) as DealStrategy | null;
  const workflowTemplateKey =
    (deal.workflowTemplateKey ?? legacyFields.workflowTemplateKey) as WorkflowTemplateKey | null;
  const currentStageKey =
    (deal.currentStageKey ??
      resolveStageKeyFromLegacyStatus((deal.legacyStatus ?? deal.status) as DealStatus)) as DealStageKey;

  const workflowTemplate = workflowTemplateKey
    ? await prisma.workflowTemplate.findFirst({
        where: {
          orgId,
          key: workflowTemplateKey,
        },
        include: {
          stages: {
            orderBy: { ordinal: "asc" },
          },
        },
      })
    : null;

  return {
    dealId: deal.id,
    orgId: deal.orgId,
    name: deal.name,
    sku: deal.sku,
    jurisdictionId: deal.jurisdictionId,
    status: deal.status as DealStatus,
    strategy,
    workflowTemplateKey,
    currentStageKey,
    templateStages:
      workflowTemplate?.stages.map((stage) => ({
        key: stage.key,
        name: stage.name,
        ordinal: stage.ordinal,
        description: stage.description,
        requiredGate: stage.requiredGate,
      })) ?? getFallbackWorkflowStages(workflowTemplateKey),
  };
}

export function isEntitlementStrategy(
  context: AutomationDealContext | null,
): boolean {
  return (
    context?.workflowTemplateKey === "ENTITLEMENT_LAND" ||
    context?.strategy === "ENTITLEMENT"
  );
}

export function getCurrentWorkflowStage(
  context: AutomationDealContext,
): AutomationDealContext["templateStages"][number] | null {
  return context.templateStages.find((stage) => stage.key === context.currentStageKey) ?? null;
}

export function getNextWorkflowStage(
  context: AutomationDealContext,
): AutomationDealContext["templateStages"][number] | null {
  const currentStage = getCurrentWorkflowStage(context);
  if (!currentStage) {
    return null;
  }

  return (
    context.templateStages.find((stage) => stage.ordinal === currentStage.ordinal + 1) ??
    null
  );
}

export function getWorkflowPipelineStep(
  context: AutomationDealContext,
  stageKey: DealStageKey = context.currentStageKey,
): number {
  return (
    context.templateStages.find((stage) => stage.key === stageKey)?.ordinal ??
    1
  );
}
