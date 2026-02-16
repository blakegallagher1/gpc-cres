export type SerializedRunStateEnvelope = {
  version: 1;
  serializedRunState: string;
  checkpoint: {
    kind:
      | "tool_completion"
      | "approval_pending"
      | "resume_request"
      | "final_result";
    at: string;
    runId?: string;
    toolName?: string | null;
    toolCallId?: string | null;
    lastAgentName?: string;
    correlationId?: string;
    partialOutput?: string;
    note?: string;
  };
};

type SerializeRunStateParams = {
  serializedRunState: string;
  checkpoint: SerializedRunStateEnvelope["checkpoint"];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function serializeRunStateEnvelope(
  params: SerializeRunStateParams,
): SerializedRunStateEnvelope {
  return {
    version: 1,
    serializedRunState: params.serializedRunState,
    checkpoint: params.checkpoint,
  };
}

export function deserializeRunStateEnvelope(
  value: unknown,
): SerializedRunStateEnvelope | null {
  if (!isRecord(value)) return null;
  if (value.version !== 1) return null;
  if (typeof value.serializedRunState !== "string" || value.serializedRunState.length === 0) {
    return null;
  }
  if (!isRecord(value.checkpoint)) return null;
  if (typeof value.checkpoint.kind !== "string") return null;
  if (typeof value.checkpoint.at !== "string") return null;

  const checkpointKind = value.checkpoint.kind;
  if (
    checkpointKind !== "tool_completion" &&
    checkpointKind !== "approval_pending" &&
    checkpointKind !== "resume_request" &&
    checkpointKind !== "final_result"
  ) {
    return null;
  }

  return {
    version: 1,
    serializedRunState: value.serializedRunState,
    checkpoint: {
      kind: checkpointKind,
      at: value.checkpoint.at,
      runId:
        typeof value.checkpoint.runId === "string" ? value.checkpoint.runId : undefined,
      toolName:
        typeof value.checkpoint.toolName === "string"
          ? value.checkpoint.toolName
          : value.checkpoint.toolName === null
            ? null
            : undefined,
      toolCallId:
        typeof value.checkpoint.toolCallId === "string"
          ? value.checkpoint.toolCallId
          : value.checkpoint.toolCallId === null
            ? null
            : undefined,
      lastAgentName:
        typeof value.checkpoint.lastAgentName === "string"
          ? value.checkpoint.lastAgentName
          : undefined,
      correlationId:
        typeof value.checkpoint.correlationId === "string"
          ? value.checkpoint.correlationId
          : undefined,
      partialOutput:
        typeof value.checkpoint.partialOutput === "string"
          ? value.checkpoint.partialOutput
          : undefined,
      note:
        typeof value.checkpoint.note === "string" ? value.checkpoint.note : undefined,
    },
  };
}
