import type { Prisma } from "@entitlement-os/db";
import { deserializeRunStateEnvelope } from "@entitlement-os/openai";
import type { AgentReport } from "@entitlement-os/shared";
import { isRecord } from "@entitlement-os/shared";
import {
  normalizeSku,
  persistFinalRunResult,
  upsertRunRecord,
} from "@entitlement-os/db";
import type { AgentTrustEnvelope } from "../../../../apps/web/types/index";

/**
 * Normalized agent run payload returned by local execution and replay paths.
 */
export type AgentExecutionResult = {
  runId: string;
  status: "running" | "succeeded" | "failed" | "canceled";
  finalOutput: string;
  finalReport: AgentReport | null;
  toolsInvoked: string[];
  trust: AgentTrustEnvelope;
  openaiResponseId: string | null;
  inputHash: string;
  startedAt: Date;
  finishedAt: Date;
};

/**
 * Reads the serialized run-state string from either the current envelope shape
 * or the legacy inline field used by older persisted runs.
 */
export function readSerializedRunStateFromStoredValue(value: unknown): string | null {
  const envelope = deserializeRunStateEnvelope(value);
  if (envelope) {
    return envelope.serializedRunState;
  }

  if (isRecord(value) && typeof value.serializedRunState === "string") {
    return value.serializedRunState;
  }

  return null;
}

export type { Prisma };
