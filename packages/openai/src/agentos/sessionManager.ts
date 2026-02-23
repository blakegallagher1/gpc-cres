import { getAgentOsConfig, isAgentOsFeatureEnabled } from "./config.js";

export type ResponseContinuationParams = {
  previous_response_id?: string;
  context_management?: {
    strategy: "compaction";
  };
};

function isResponseId(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("resp");
}

export function buildResponseContinuationParams(
  previousResponseId?: string | null,
): ResponseContinuationParams {
  const params: ResponseContinuationParams = {};
  if (isResponseId(previousResponseId)) {
    params.previous_response_id = previousResponseId;
  }
  if (isAgentOsFeatureEnabled("contextManagementCompaction")) {
    params.context_management = {
      strategy: getAgentOsConfig().contextManagement.strategy,
    };
  }
  return params;
}

