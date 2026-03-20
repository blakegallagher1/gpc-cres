import "server-only";

import { prisma, type Prisma } from "@entitlement-os/db";
import { hashJsonSha256 } from "@entitlement-os/shared/crypto";

import { AUTOMATION_CONFIG } from "@/lib/automation/config";
import { deleteKnowledge, ingestKnowledge } from "@/lib/services/knowledgeBase.service";

export type UpsertProceduralSkillsFromEpisodeInput = {
  orgId: string;
  episodicEntryId: string;
  signal?: AbortSignal;
};

export type UpsertProceduralSkillsFromEpisodeResult = {
  updatedSkillCount: number;
  skillIds: string[];
};

type EpisodeClusterItem = {
  id: string;
  summary: string;
  outcome: "SUCCESS" | "FAILURE" | "PARTIAL";
  confidence: number;
  toolSequence: string[];
  metadata: Prisma.JsonValue | null;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeToolSequence(sequence: string[]): string[] {
  const out: string[] = [];
  for (const item of sequence) {
    const normalized = item.trim();
    if (!normalized) continue;
    if (out[out.length - 1] !== normalized) out.push(normalized);
  }
  return out;
}

export function buildProcedureDedupeHash(params: {
  taskType: string;
  agentId: string;
  toolSequence: string[];
}): string {
  return hashJsonSha256({
    taskType: params.taskType,
    agentId: params.agentId,
    toolSequence: normalizeToolSequence(params.toolSequence),
  });
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function buildSkillName(taskType: string, agentId: string): string {
  return `${taskType} ${agentId} procedure`;
}

function buildSkillDescription(taskType: string, agentId: string, supportCount: number): string {
  return `Reusable ${taskType} playbook for ${agentId}, derived from ${supportCount} successful prior runs.`;
}

function buildEvidenceRequirements(supportingEpisodes: EpisodeClusterItem[]): string[] {
  const evidenceHeavy = supportingEpisodes.some((episode) => {
    const metadata = isRecord(episode.metadata) ? episode.metadata : {};
    const evidenceCount = metadata.evidenceCount;
    return typeof evidenceCount === "number" && evidenceCount > 0;
  });

  return evidenceHeavy
    ? ["Must include supporting citations before finalizing conclusions."]
    : ["Must preserve the same evidence bar used by the supporting runs."];
}

function buildFailureModes(failureEpisodes: EpisodeClusterItem[]): string[] {
  return failureEpisodes
    .slice(0, 3)
    .map((episode) => episode.summary.replace(/\s+/g, " ").trim().slice(0, 220));
}

function buildSkillMarkdown(params: {
  name: string;
  taskType: string;
  agentId: string;
  toolSequence: string[];
  evidenceRequirements: string[];
  failureModes: string[];
  supportCount: number;
}): string {
  return [
    `# ${params.name}`,
    "",
    "## Trigger conditions",
    `- Task type: ${params.taskType}`,
    `- Agent: ${params.agentId}`,
    "",
    "## Preferred tool sequence",
    ...(params.toolSequence.length > 0
      ? params.toolSequence.map((toolName, index) => `${index + 1}. ${toolName}`)
      : ["1. No deterministic tool sequence captured."]),
    "",
    "## Evidence requirements",
    ...params.evidenceRequirements.map((item) => `- ${item}`),
    "",
    "## Common failure modes",
    ...(params.failureModes.length > 0
      ? params.failureModes.map((item) => `- ${item}`)
      : ["- No recurring failure modes identified yet."]),
    "",
    "## Notes",
    `Derived from ${params.supportCount} successful prior runs.`,
  ].join("\n");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Agent learning promotion aborted");
  }
}

async function loadEpisodeCluster(
  input: UpsertProceduralSkillsFromEpisodeInput,
): Promise<{
  episode: {
    id: string;
    taskType: string;
    agentId: string;
    toolSequence: string[];
  };
  allClusterEpisodes: EpisodeClusterItem[];
  supportingEpisodes: EpisodeClusterItem[];
  failureEpisodes: EpisodeClusterItem[];
} | null> {
  throwIfAborted(input.signal);
  const episode = await prisma.episodicEntry.findFirst({
    where: {
      id: input.episodicEntryId,
      orgId: input.orgId,
    },
    select: {
      id: true,
      taskType: true,
      agentId: true,
      toolSequence: true,
    },
  });

  if (!episode) {
    return null;
  }

  const normalizedToolSequence = normalizeToolSequence(episode.toolSequence);

  const clusterEpisodes = await prisma.episodicEntry.findMany({
    where: {
      orgId: input.orgId,
      taskType: episode.taskType,
      agentId: episode.agentId,
    },
    select: {
      id: true,
      summary: true,
      outcome: true,
      confidence: true,
      toolSequence: true,
      metadata: true,
    },
    orderBy: { updatedAt: "desc" },
  });
  throwIfAborted(input.signal);

  const allClusterEpisodes = clusterEpisodes.filter((candidate) => {
    const candidateSequence = normalizeToolSequence(candidate.toolSequence);
    return candidateSequence.join("::") === normalizedToolSequence.join("::");
  });

  return {
    episode: {
      ...episode,
      toolSequence: normalizedToolSequence,
    },
    supportingEpisodes: allClusterEpisodes.filter((candidate) => candidate.outcome === "SUCCESS"),
    failureEpisodes: allClusterEpisodes.filter((candidate) => candidate.outcome !== "SUCCESS"),
    allClusterEpisodes,
  };
}

export async function upsertProceduralSkillsFromEpisode(
  input: UpsertProceduralSkillsFromEpisodeInput,
): Promise<UpsertProceduralSkillsFromEpisodeResult> {
  const cluster = await loadEpisodeCluster(input);
  if (!cluster) {
    return { updatedSkillCount: 0, skillIds: [] };
  }

  const successRate =
    cluster.supportingEpisodes.length / Math.max(1, cluster.allClusterEpisodes.length);

  if (
    cluster.supportingEpisodes.length < AUTOMATION_CONFIG.agentLearning.minEpisodesForSkill ||
    successRate < AUTOMATION_CONFIG.agentLearning.minSkillSuccessRate
  ) {
    return { updatedSkillCount: 0, skillIds: [] };
  }

  const dedupeHash = buildProcedureDedupeHash({
    taskType: cluster.episode.taskType,
    agentId: cluster.episode.agentId,
    toolSequence: cluster.episode.toolSequence,
  });
  const name = buildSkillName(cluster.episode.taskType, cluster.episode.agentId);
  const description = buildSkillDescription(
    cluster.episode.taskType,
    cluster.episode.agentId,
    cluster.supportingEpisodes.length,
  );
  const evidenceRequirements = buildEvidenceRequirements(cluster.supportingEpisodes);
  const failureModes = buildFailureModes(cluster.failureEpisodes);
  const skillMdContent = buildSkillMarkdown({
    name,
    taskType: cluster.episode.taskType,
    agentId: cluster.episode.agentId,
    toolSequence: cluster.episode.toolSequence,
    evidenceRequirements,
    failureModes,
    supportCount: cluster.supportingEpisodes.length,
  });
  const sourceId = `skill:${dedupeHash}`;

  throwIfAborted(input.signal);
  await deleteKnowledge(input.orgId, sourceId).catch(() => 0);
  throwIfAborted(input.signal);
  const knowledgeIds = await ingestKnowledge(
    input.orgId,
    "procedural_skill",
    sourceId,
    skillMdContent,
    {
      orgId: input.orgId,
      name,
      description,
      taskType: cluster.episode.taskType,
      agentId: cluster.episode.agentId,
      toolSequence: cluster.episode.toolSequence,
      successRate,
      successCount: cluster.supportingEpisodes.length,
      failCount: cluster.failureEpisodes.length,
    },
  );
  const embeddingId = knowledgeIds[0] ?? sourceId;
  const evaluatorAvgScore =
    cluster.supportingEpisodes.reduce((sum, episode) => sum + episode.confidence, 0) /
    Math.max(1, cluster.supportingEpisodes.length);
  const now = new Date();

  throwIfAborted(input.signal);
  const skill = await prisma.proceduralSkill.upsert({
    where: {
      orgId_dedupeHash: {
        orgId: input.orgId,
        dedupeHash,
      },
    },
    create: {
      orgId: input.orgId,
      name,
      description,
      skillMdContent,
      toolSequence: cluster.episode.toolSequence,
      taskType: cluster.episode.taskType,
      agentId: cluster.episode.agentId,
      triggerConditions: toJsonValue({
        taskType: cluster.episode.taskType,
        agentId: cluster.episode.agentId,
      }),
      evidenceRequirements: toJsonValue(evidenceRequirements),
      failureModes: toJsonValue(failureModes),
      successCount: cluster.supportingEpisodes.length,
      failCount: cluster.failureEpisodes.length,
      successRate,
      evaluatorAvgScore,
      dedupeHash,
      embeddingId,
      lastPromotedAt: now,
    },
    update: {
      name,
      description,
      skillMdContent,
      toolSequence: cluster.episode.toolSequence,
      taskType: cluster.episode.taskType,
      agentId: cluster.episode.agentId,
      triggerConditions: toJsonValue({
        taskType: cluster.episode.taskType,
        agentId: cluster.episode.agentId,
      }),
      evidenceRequirements: toJsonValue(evidenceRequirements),
      failureModes: toJsonValue(failureModes),
      successCount: cluster.supportingEpisodes.length,
      failCount: cluster.failureEpisodes.length,
      successRate,
      evaluatorAvgScore,
      embeddingId,
      lastPromotedAt: now,
    },
    select: {
      id: true,
    },
  });

  const supportingEpisodeIds = cluster.supportingEpisodes.map((episode) => episode.id);

  throwIfAborted(input.signal);
  await prisma.proceduralSkillEpisode.deleteMany({
    where: {
      orgId: input.orgId,
      proceduralSkillId: skill.id,
      episodicEntryId: {
        notIn: supportingEpisodeIds,
      },
    },
  });

  for (const episode of cluster.supportingEpisodes) {
    throwIfAborted(input.signal);
    await prisma.proceduralSkillEpisode.upsert({
      where: {
        proceduralSkillId_episodicEntryId: {
          proceduralSkillId: skill.id,
          episodicEntryId: episode.id,
        },
      },
      create: {
        orgId: input.orgId,
        proceduralSkillId: skill.id,
        episodicEntryId: episode.id,
        relationType: "supporting",
        weight: episode.confidence,
      },
      update: {
        relationType: "supporting",
        weight: episode.confidence,
      },
    });
  }

  return {
    updatedSkillCount: 1,
    skillIds: [skill.id],
  };
}
