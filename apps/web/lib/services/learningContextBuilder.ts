import "server-only";

import {
  searchKnowledgeBase,
  type KnowledgeSearchResult,
} from "@/lib/services/knowledgeBase.service";
import { AUTOMATION_CONFIG } from "@/lib/automation/config";

export type BuildLearningContextInput = {
  orgId: string;
  userId: string;
  userMessage: string;
  conversationId?: string | null;
  dealId?: string | null;
  jurisdictionId?: string | null;
  runTypeHint?: string | null;
};

export type BuildLearningContextResult = {
  contextBlock: string;
  episodeResults: KnowledgeSearchResult[];
  procedureResults: KnowledgeSearchResult[];
};

function getMetadataValue(
  result: KnowledgeSearchResult,
  key: string,
): string | null {
  const value = result.metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getMetadataNumber(
  result: KnowledgeSearchResult,
  key: string,
): number | null {
  const value = result.metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function truncateText(value: string, limit: number): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit - 3)}...`;
}

export function rankEpisodeResults(
  results: KnowledgeSearchResult[],
  input: Pick<BuildLearningContextInput, "conversationId" | "dealId" | "jurisdictionId" | "runTypeHint">,
): KnowledgeSearchResult[] {
  return [...results].sort((a, b) => {
    const am = (a.metadata ?? {}) as Record<string, unknown>;
    const bm = (b.metadata ?? {}) as Record<string, unknown>;

    const aBoost =
      (input.dealId && am.dealId === input.dealId ? 0.30 : 0) +
      (input.jurisdictionId && am.jurisdictionId === input.jurisdictionId ? 0.20 : 0) +
      (input.runTypeHint && am.taskType === input.runTypeHint ? 0.15 : 0);

    const bBoost =
      (input.dealId && bm.dealId === input.dealId ? 0.30 : 0) +
      (input.jurisdictionId && bm.jurisdictionId === input.jurisdictionId ? 0.20 : 0) +
      (input.runTypeHint && bm.taskType === input.runTypeHint ? 0.15 : 0);

    return (b.similarity + bBoost) - (a.similarity + aBoost);
  });
}

function rankProcedureResults(
  results: KnowledgeSearchResult[],
  input: Pick<BuildLearningContextInput, "dealId" | "jurisdictionId" | "runTypeHint">,
): KnowledgeSearchResult[] {
  return [...results].sort((a, b) => {
    const am = (a.metadata ?? {}) as Record<string, unknown>;
    const bm = (b.metadata ?? {}) as Record<string, unknown>;

    const aBoost =
      (input.dealId && am.dealId === input.dealId ? 0.20 : 0) +
      (input.jurisdictionId && am.jurisdictionId === input.jurisdictionId ? 0.15 : 0) +
      (input.runTypeHint && am.taskType === input.runTypeHint ? 0.15 : 0);

    const bBoost =
      (input.dealId && bm.dealId === input.dealId ? 0.20 : 0) +
      (input.jurisdictionId && bm.jurisdictionId === input.jurisdictionId ? 0.15 : 0) +
      (input.runTypeHint && bm.taskType === input.runTypeHint ? 0.15 : 0);

    return (b.similarity + bBoost) - (a.similarity + aBoost);
  });
}

function formatEpisodeBlock(results: KnowledgeSearchResult[]): string {
  return [
    "[Similar Prior Runs]",
    "Treat the following as background from prior completed agent runs. Reuse patterns only when the task and evidence requirements are truly similar.",
    "",
    ...results.map((result) => {
      const taskType = getMetadataValue(result, "taskType") ?? "unknown";
      const outcome = getMetadataValue(result, "outcome") ?? "unknown";
      const confidence = getMetadataNumber(result, "confidence");
      return `- task=${taskType} | outcome=${outcome} | confidence=${confidence !== null ? confidence.toFixed(2) : "unknown"} | summary: ${truncateText(result.contentText, 280)}`;
    }),
  ].join("\n");
}

function formatProcedureBlock(results: KnowledgeSearchResult[]): string {
  return [
    "[Relevant Procedures]",
    "Use these as candidate playbooks, not as hard rules.",
    "",
    ...results.map((result) => {
      const procedure = getMetadataValue(result, "name") ?? getMetadataValue(result, "taskType") ?? "unnamed";
      const successRate = getMetadataNumber(result, "successRate");
      const toolSequence = Array.isArray(result.metadata?.toolSequence)
        ? (result.metadata.toolSequence as unknown[]).filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : [];
      const summary = getMetadataValue(result, "description") ?? result.contentText;
      return `- procedure=${procedure} | successRate=${successRate !== null ? successRate.toFixed(2) : "unknown"} | sequence=${toolSequence.length > 0 ? toolSequence.join(" -> ") : "n/a"} | summary: ${truncateText(summary, 240)}`;
    }),
  ].join("\n");
}

export async function buildLearningContext(
  input: BuildLearningContextInput,
): Promise<BuildLearningContextResult> {
  const episodeLimit = Math.max(
    AUTOMATION_CONFIG.agentLearning.maxSimilarEpisodes * 3,
    AUTOMATION_CONFIG.agentLearning.maxSimilarEpisodes,
  );

  const rawEpisodes = AUTOMATION_CONFIG.agentLearning.injectEpisodes
    ? await searchKnowledgeBase(
        input.orgId,
        input.userMessage,
        ["episodic_summary"],
        episodeLimit,
      )
    : [];

  const episodeResults = rankEpisodeResults(rawEpisodes, input).slice(
    0,
    AUTOMATION_CONFIG.agentLearning.maxSimilarEpisodes,
  );

  const rawProcedures = AUTOMATION_CONFIG.agentLearning.injectProcedures
    ? await searchKnowledgeBase(
        input.orgId,
        input.userMessage,
        ["procedural_skill"],
        Math.max(
          AUTOMATION_CONFIG.agentLearning.maxProcedures * 3,
          AUTOMATION_CONFIG.agentLearning.maxProcedures,
        ),
      )
    : [];

  const procedureResults = AUTOMATION_CONFIG.agentLearning.injectProcedures
    ? rankProcedureResults(rawProcedures, input).slice(
        0,
        AUTOMATION_CONFIG.agentLearning.maxProcedures,
      )
    : [];

  const blocks: string[] = [];
  if (episodeResults.length > 0) {
    blocks.push(formatEpisodeBlock(episodeResults));
  }
  if (AUTOMATION_CONFIG.agentLearning.injectProcedures && procedureResults.length > 0) {
    blocks.push(formatProcedureBlock(procedureResults));
  }

  return {
    contextBlock: blocks.join("\n\n"),
    episodeResults,
    procedureResults,
  };
}
