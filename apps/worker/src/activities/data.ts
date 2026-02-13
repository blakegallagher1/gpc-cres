import { prisma, type Prisma } from "@entitlement-os/db";
import {
  assertParishPackSchemaAndCitations,
  computeTaskDueAt,
  type ThroughputRouting,
} from "@entitlement-os/shared";
import type { RunRecordCreateInput, SkuType } from "@entitlement-os/shared";

/**
 * Load a deal from the database.
 */
export async function loadDeal(params: {
  dealId: string;
}): Promise<{
  id: string;
  name: string;
  sku: string;
  status: string;
  jurisdictionId: string;
}> {
  const deal = await prisma.deal.findUniqueOrThrow({
    where: { id: params.dealId },
  });

  return {
    id: deal.id,
    name: deal.name,
    sku: deal.sku,
    status: deal.status,
    jurisdictionId: deal.jurisdictionId,
  };
}

/**
 * Create the initial pipeline task plan for a deal (tasks 1-8).
 */
export async function createInitialTaskPlan(params: {
  dealId: string;
  orgId: string;
  routing?: ThroughputRouting;
}): Promise<Array<{ id: string; title: string; pipelineStep: number }>> {
  const createdAt = new Date();
  const slaTier = params.routing?.slaTier ?? "standard";
  const taskTemplates = [
    { title: "Site control / LOI", pipelineStep: 1 },
    { title: "Parish pack review", pipelineStep: 2 },
    { title: "Pre-application meeting", pipelineStep: 3 },
    { title: "Concept plan prep", pipelineStep: 4 },
    { title: "Neighbor outreach", pipelineStep: 5 },
    { title: "Application submission", pipelineStep: 6 },
    { title: "Hearing preparation", pipelineStep: 7 },
    { title: "Post-approval conditions", pipelineStep: 8 },
  ];

  const tasks = await prisma.$transaction(
    taskTemplates.map((t) =>
      prisma.task.create({
        data: {
          dealId: params.dealId,
          orgId: params.orgId,
          title: t.title,
          description: params.routing
            ? `Queue: ${params.routing.queueName}; SLA: ${params.routing.slaTier}; Complexity: ${params.routing.complexityClass}; Confidence: ${params.routing.confidenceClass}.`
            : "Queue: entitlement-os.standard; SLA: standard.",
          pipelineStep: t.pipelineStep,
          status: "TODO",
          dueAt: computeTaskDueAt(createdAt, t.pipelineStep, slaTier),
        },
      }),
    ),
  );

  return tasks.map((t: {
    id: string;
    title: string;
    pipelineStep: number;
  }) => ({
    id: t.id,
    title: t.title,
    pipelineStep: t.pipelineStep,
  }));
}

/**
 * Validate and store a parish pack version in the database.
 */
export async function validateAndStorePack(params: {
  jurisdictionId: string;
  sku: SkuType;
  orgId: string;
  packJson: Record<string, unknown>;
  runId: string;
  sourceEvidenceIds: string[];
  sourceSnapshotIds: string[];
  sourceContentHashes: string[];
  sourceUrls: string[];
  officialOnly: boolean;
  inputHash?: string;
}): Promise<{ id: string; version: number }> {
  const jurisdiction = await prisma.jurisdiction.findUnique({
    where: { id: params.jurisdictionId },
    select: { officialDomains: true },
  });

  const officialDomains = jurisdiction?.officialDomains ?? [];

  const validatedPack = assertParishPackSchemaAndCitations(params.packJson, officialDomains);

  const canonicalSchemaVersion = validatedPack.schema_version;
  const coverageSourceCount = new Set(validatedPack.sources_summary).size;
  const packCoverageScore =
    params.sourceUrls.length > 0
      ? coverageSourceCount / params.sourceUrls.length
      : 0;

  // Find the latest version number for this jurisdiction+sku
  const latest = await prisma.parishPackVersion.findFirst({
    where: {
      jurisdictionId: params.jurisdictionId,
      sku: params.sku,
    },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const nextVersion = (latest?.version ?? 0) + 1;

  const packVersion = await prisma.parishPackVersion.create({
    data: {
      jurisdictionId: params.jurisdictionId,
      sku: params.sku,
      orgId: params.orgId,
      version: nextVersion,
      packJson: params.packJson as Prisma.InputJsonValue,
      status: "current",
      generatedAt: new Date(),
      generatedByRunId: params.runId,
      sourceEvidenceIds: [...new Set(params.sourceEvidenceIds)],
      sourceSnapshotIds: [...new Set(params.sourceSnapshotIds)],
      sourceContentHashes: [...new Set(params.sourceContentHashes)],
      sourceUrls: [...new Set(params.sourceUrls)],
      officialOnly: params.officialOnly,
      packCoverageScore,
      canonicalSchemaVersion,
      coverageSourceCount,
      inputHash: params.inputHash,
    },
  });

  // Mark previous versions as superseded
  await prisma.parishPackVersion.updateMany({
    where: {
      jurisdictionId: params.jurisdictionId,
      sku: params.sku,
      id: { not: packVersion.id },
    },
    data: { status: "superseded" },
  });

  return { id: packVersion.id, version: nextVersion };
}

/**
 * Create a run record in the database.
 */
export async function createRunRecord(params: RunRecordCreateInput): Promise<{ id: string }> {
  const run = await prisma.run.create({
    data: {
      orgId: params.orgId,
      runType: params.runType,
      dealId: params.dealId ?? null,
      jurisdictionId: params.jurisdictionId ?? null,
      sku: params.sku ?? null,
      status: params.status ?? "running",
      inputHash: params.inputHash ?? null,
    },
  });

  return { id: run.id };
}

/**
 * Update the status of a run record.
 */
export async function updateRunStatus(params: {
  runId: string;
  status: "running" | "succeeded" | "failed" | "canceled";
}): Promise<void> {
  await prisma.run.update({
    where: { id: params.runId },
    data: { status: params.status },
  });
}
