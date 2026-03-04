import OpenAI from "openai";

import type { CompactionControl } from "../responses.js";
import { getAgentOsConfig, isAgentOsFeatureEnabled } from "./config.js";

const RESPONSE_ID_PATTERN = /^resp_[A-Za-z0-9]+$/;
const ALLOWED_CONTEXT_MANAGEMENT_TYPES = ["compaction"] as const;

export type ContextManagementEntry = {
  type: (typeof ALLOWED_CONTEXT_MANAGEMENT_TYPES)[number];
  compact_threshold?: number;
};

export type ResponseContinuationParams = {
  previous_response_id?: string;
  context_management?: ContextManagementEntry[];
};

function isResponseId(value: unknown): value is string {
  return typeof value === "string" && RESPONSE_ID_PATTERN.test(value.trim());
}

function normalizeThreshold(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const trimmed = Math.floor(value);
  return trimmed > 0 ? trimmed : undefined;
}

function isAllowedContextType(value: unknown): value is ContextManagementEntry["type"] {
  return (
    typeof value === "string" &&
    ALLOWED_CONTEXT_MANAGEMENT_TYPES.includes(value as ContextManagementEntry["type"])
  );
}

function normalizeContextManagementEntry(
  entry: OpenAI.Responses.ResponseCreateParams.ContextManagement,
): ContextManagementEntry | null {
  if (
    typeof entry !== "object" ||
    entry === null ||
    !isAllowedContextType((entry as { type?: unknown }).type)
  ) {
    return null;
  }

  const compactThreshold = normalizeThreshold(
    (entry as { compact_threshold?: unknown }).compact_threshold,
  );

  return {
    type: (entry as { type: ContextManagementEntry["type"] }).type,
    ...(compactThreshold !== undefined ? { compact_threshold: compactThreshold } : {}),
  };
}

export function buildResponseContinuationParams(
  previousResponseId?: string | null,
  overrideContextManagement?: OpenAI.Responses.ResponseCreateParams["context_management"] | null,
  compaction?: CompactionControl,
): ResponseContinuationParams {
  const params: ResponseContinuationParams = {};
  if (isResponseId(previousResponseId)) {
    params.previous_response_id = previousResponseId.trim();
  }

  if (overrideContextManagement === null) {
    return params;
  }

  if (Array.isArray(overrideContextManagement)) {
    const normalized = overrideContextManagement
      .map(normalizeContextManagementEntry)
      .filter((entry): entry is ContextManagementEntry => entry !== null);
    if (normalized.length > 0) {
      params.context_management = normalized;
    }
    return params;
  }

  if (
    (compaction && "enabled" in compaction && compaction.enabled === false)
    || (compaction && "strategy" in compaction && compaction.strategy === "manual")
  ) {
    return params;
  }

  if (isAgentOsFeatureEnabled("contextManagementCompaction")) {
    params.context_management = [
      {
        type: getAgentOsConfig().contextManagement.type,
        compact_threshold: getAgentOsConfig().contextManagement.compactionThreshold,
      },
    ];
  }

  return params;
}
