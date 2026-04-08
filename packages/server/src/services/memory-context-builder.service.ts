import type { MemoryVerified } from "@entitlement-os/db";

import {
  getCalibrationDelta,
  getCalibrationSegmentForEntity,
} from "./calibration.service";
import {
  estimateTokens,
  INJECTION_BUDGET,
} from "./injection-budget.service";
import { classifyIntent } from "./intent-classifier.service";
import { retrieveMemoryForIntent } from "./memory-retrieval.service";

type ScoredMemoryRecord<T> = { record: T };
type MemoryIntent = Awaited<ReturnType<typeof classifyIntent>>;

interface MemoryContextInput {
  userMessage: string;
  entityId?: string;
  orgId: string;
  address?: string;
  parcelId?: string;
}

export interface MemoryContextResult {
  contextBlock: string;
  intent: MemoryIntent;
  itemCount: number;
  totalTokens: number;
}

function formatMemoryItem(record: MemoryVerified): string {
  const payload = record.payloadJson as Record<string, unknown>;
  const entries = Object.entries(payload)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(", ");
  return `[${record.factType}/${record.sourceType}] ${entries}`;
}

function formatScoredItem(item: ScoredMemoryRecord<MemoryVerified>): string {
  return formatMemoryItem(item.record);
}

export async function buildMemoryContext(
  input: MemoryContextInput,
): Promise<MemoryContextResult | null> {
  if (!input.entityId) return null;

  const intent = await classifyIntent(input.userMessage, {
    entityId: input.entityId,
    orgId: input.orgId,
    address: input.address,
    parcelId: input.parcelId,
  });

  const retrieval = await retrieveMemoryForIntent({
    entityId: input.entityId,
    orgId: input.orgId,
    intent,
    queryText: input.userMessage,
  });

  const sections: string[] = [];
  if (retrieval.tier0Items.length > 0) {
    sections.push(
      `[Key Facts (always-injected)]\n  ${retrieval.tier0Items
        .map((item) => formatMemoryItem(item.record))
        .join("\n  ")}`,
    );
  }
  if (retrieval.tier1Items.length > 0) {
    sections.push(
      `[Relevant Memory (${intent.intent})]\n  ${retrieval.tier1Items
        .map(formatScoredItem)
        .join("\n  ")}`,
    );
  }
  if (retrieval.tier2Items.length > 0) {
    sections.push(
      `[Extended Context]\n  ${retrieval.tier2Items
        .map(formatScoredItem)
        .join("\n  ")}`,
    );
  }

  if (intent.intent === "underwrite") {
    try {
      const segment = await getCalibrationSegmentForEntity(
        input.orgId,
        input.entityId,
      );
      if (segment) {
        const deltas = await getCalibrationDelta(input.orgId, segment);
        if (deltas && deltas.length > 0) {
          const sampleN = deltas[0]?.sampleN ?? 0;
          const confidence = deltas[0]?.confidence ?? 0;
          const provenance = `Segment: ${segment.propertyType} / ${segment.market} / ${segment.strategy} / ${segment.leverageBand} / ${segment.vintageYear} (sampleN: ${sampleN}, confidence: ${confidence.toFixed(2)})`;
          const deltaLines = deltas
            .map((delta) => {
              const signed =
                delta.bias >= 0
                  ? `+${delta.bias.toFixed(4)}`
                  : delta.bias.toFixed(4);
              return `${delta.metricKey}: bias ${signed}`;
            })
            .join("\n  ");
          sections.push(
            `[Calibration Adjustments]\n  ${provenance}\n  ${deltaLines}`,
          );
        }
      }
    } catch {
      // Calibration is optional; never block chat flow.
    }
  }

  if (sections.length === 0) return null;

  let contextBlock = sections.join("\n\n");
  if (estimateTokens(contextBlock) > INJECTION_BUDGET.TOTAL_CONTEXT_TOKENS) {
    contextBlock = contextBlock.slice(
      0,
      INJECTION_BUDGET.TOTAL_CONTEXT_TOKENS * 4,
    );
  }

  return {
    contextBlock,
    intent,
    itemCount:
      retrieval.tier0Items.length +
      retrieval.tier1Items.length +
      retrieval.tier2Items.length,
    totalTokens: retrieval.totalTokensEstimate,
  };
}
