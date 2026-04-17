import "server-only";
import { prisma } from "@entitlement-os/db";
import type { Prisma } from "@entitlement-os/db";
import { createStrictJsonResponse } from "@entitlement-os/openai";
import { randomUUID } from "node:crypto";
import {
  MemoryWriteSchema,
  memoryWriteJsonSchema,
  type MemoryWrite,
  type CorrectionPayload,
  type CompPayload,
} from "@entitlement-os/shared/memory-write";
import { detectConflicts } from "./conflict-detection.service";
import { applyCorrection } from "./correction.service";
import { getMemoryEventService } from "./memory-event.service";
import { assignTier } from "./memory-tier.service";

type WriteContext = {
  entityId: string;
  orgId: string;
  address?: string;
  parcelId?: string;
};

export type WriteGateDecision = "draft" | "verified" | "rejected";

export interface WriteGateResult {
  decision: WriteGateDecision;
  structuredMemoryWrite: MemoryWrite | null;
  reasons: string[];
  eventLogId?: string;
  recordId?: string;
}

const MEMORY_WRITE_GATE_MODEL = "gpt-5.4-mini";

function addReason(reasons: string[], reason: string) {
  reasons.push(reason);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeCompPayloadFromInput(
  inputText: string,
  payload: CompPayload,
): CompPayload {
  const capRate = payload.cap_rate;
  if (typeof capRate !== "number" || !Number.isFinite(capRate)) {
    return payload;
  }

  // User-facing chat prompts usually express cap rate as a percentage (6.1%),
  // while the model occasionally emits a decimal (0.061). Normalize only when
  // the original prompt clearly used percent notation for cap rate.
  if (
    capRate > 0 &&
    capRate < 1 &&
    /\bcap(?:\s|-)?rate\b/i.test(inputText) &&
    inputText.includes("%")
  ) {
    return {
      ...payload,
      cap_rate: Number((capRate * 100).toFixed(4)),
    };
  }

  return payload;
}

export async function memoryWriteGate(
  inputText: string,
  entityContext: WriteContext,
): Promise<WriteGateResult> {
  const requestId = randomUUID();
  const reasons: string[] = [];
  const eventService = getMemoryEventService();
  const { entityId, orgId } = entityContext;

  try {
    const response = await createStrictJsonResponse<MemoryWrite>({
      model: process.env.MEMORY_WRITE_GATE_MODEL ?? MEMORY_WRITE_GATE_MODEL,
      input: [
        {
          role: "system",
          content: [
            "You are a CRE memory extraction system.",
            `Entity context: ${entityId}`,
            entityContext.address ? `Property address: ${entityContext.address}` : "",
            entityContext.parcelId ? `Parcel ID: ${entityContext.parcelId}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
        {
          role: "user",
          content: inputText,
        },
      ],
      jsonSchema: memoryWriteJsonSchema,
      reasoning: null,
    });

    const parsed = MemoryWriteSchema.safeParse(response.outputJson);
    if (!parsed.success) {
      const rejectionReason = `Zod validation failed: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`;
      addReason(reasons, rejectionReason);

      const eventLog = await eventService.recordEvent({
        orgId,
        entityId,
        sourceType: "agent",
        factType: "unknown",
        payloadJson: { inputText, outputJson: response.outputJson, fieldErrors: parsed.error.flatten().fieldErrors },
        status: "rejected",
        toolName: "memory_write_gate",
      });

      await prisma.memoryRejected.create({
        data: {
          orgId,
          entityId,
          factType: "unknown",
          sourceType: "agent",
          payloadJson: { inputText, outputJson: response.outputJson } as Prisma.InputJsonValue,
          rejectionReason,
          requestId,
          eventLogId: eventLog.id,
        },
      });

      return {
        decision: "rejected",
        structuredMemoryWrite: null,
        reasons,
        eventLogId: eventLog.id,
      };
    }

    const structuredWrite = parsed.data;

    // Guard: reject comp writes where all economic fields are null.
    // This happens when the LLM parses an address-only string (no real comp data)
    // and produces a CompPayload with every nullable field set to null.
    // Storing such a record would overwrite verified truth with nulls.
    if (structuredWrite.fact_type === "comp") {
      const normalizedPayload = normalizeCompPayloadFromInput(
        inputText,
        structuredWrite.payload as CompPayload,
      );
      structuredWrite.payload = normalizedPayload;
      const p = normalizedPayload;
      const hasEconomicData = [
        p.sale_price,
        p.cap_rate,
        p.noi,
        p.price_per_unit,
        p.pad_count,
        p.sale_date,
      ].some((v) => v !== null && v !== undefined);

      if (!hasEconomicData) {
        const rejectionReason =
          "Comp write rejected: input_text contains no economic data " +
          "(sale_price, cap_rate, noi, price_per_unit, pad_count, sale_date all null). " +
          "Use lookup_entity_by_address to recall existing facts, or provide actual comp data in input_text.";
        addReason(reasons, rejectionReason);

        const eventLog = await eventService.recordEvent({
          orgId,
          entityId,
          sourceType: "agent",
          factType: "comp",
          payloadJson: { inputText, outputJson: structuredWrite, rejectionReason },
          status: "rejected",
          toolName: "memory_write_gate",
        });

        await prisma.memoryRejected.create({
          data: {
            orgId,
            entityId,
            factType: "comp",
            sourceType: structuredWrite.source_type,
            payloadJson: { inputText, outputJson: structuredWrite } as Prisma.InputJsonValue,
            rejectionReason,
            requestId,
            eventLogId: eventLog.id,
          },
        });

        return {
          decision: "rejected",
          structuredMemoryWrite: null,
          reasons,
          eventLogId: eventLog.id,
        };
      }
    }

    structuredWrite.entity_id = entityId;
    const eventLog = await eventService.recordEvent({
      orgId,
      entityId,
      sourceType: structuredWrite.source_type,
      factType: structuredWrite.fact_type,
      payloadJson: structuredWrite.payload as Record<string, unknown>,
      status: "attempted",
      toolName: "memory_write_gate",
    });

    if (structuredWrite.fact_type === "correction") {
      await applyCorrection(
        entityId,
        orgId,
        structuredWrite.payload as CorrectionPayload,
        eventLog.id,
        requestId,
      );

      addReason(reasons, "Correction fact type detected. Routed to verified via correction service.");
      return {
        decision: "verified",
        structuredMemoryWrite: structuredWrite,
        reasons,
        eventLogId: eventLog.id,
      };
    }

    const conflict = await detectConflicts(
      entityId,
      orgId,
      structuredWrite.fact_type,
      structuredWrite.payload as Record<string, unknown>,
    );

    if (conflict.hasConflict) {
      const payload = structuredWrite.payload as Record<string, unknown>;
      const draftPayload = JSON.stringify(payload);
      const draftTier = assignTier({
        factType: structuredWrite.fact_type,
        economicWeight: structuredWrite.economic_weight,
        volatilityClass: structuredWrite.volatility_class,
        sourceType: structuredWrite.source_type,
        ageInDays: 0,
        payloadSizeChars: draftPayload.length,
      });
      const record = await prisma.memoryDraft.create({
        data: {
          orgId,
          entityId,
          factType: structuredWrite.fact_type,
          sourceType: structuredWrite.source_type,
          economicWeight: structuredWrite.economic_weight,
          volatilityClass: structuredWrite.volatility_class,
          payloadJson: payload as unknown as Prisma.InputJsonValue,
          conflictFlag: true,
          requestId,
          eventLogId: eventLog.id,
          tier: draftTier,
        },
      });

      addReason(
        reasons,
        `Conflict detected on keys: ${conflict.conflictKeys.join(", ")}`,
      );
      return {
        decision: "draft",
        structuredMemoryWrite: structuredWrite,
        reasons,
        eventLogId: eventLog.id,
        recordId: record.id,
      };
    }

    const verifiedPayload = structuredWrite.payload as Record<string, unknown>;
    const verifiedTier = assignTier({
      factType: structuredWrite.fact_type,
      economicWeight: structuredWrite.economic_weight,
      volatilityClass: structuredWrite.volatility_class,
      sourceType: structuredWrite.source_type,
      ageInDays: 0,
      payloadSizeChars: JSON.stringify(verifiedPayload).length,
    });
    const record = await prisma.memoryVerified.create({
      data: {
        orgId,
        entityId,
        factType: structuredWrite.fact_type,
        sourceType: structuredWrite.source_type,
        economicWeight: structuredWrite.economic_weight,
        volatilityClass: structuredWrite.volatility_class,
        payloadJson: verifiedPayload as unknown as Prisma.InputJsonValue,
        requestId,
        eventLogId: eventLog.id,
        tier: verifiedTier,
      },
    });

    addReason(reasons, "No conflicts detected. Stored as verified.");
    return {
      decision: "verified",
      structuredMemoryWrite: structuredWrite,
      reasons,
      eventLogId: eventLog.id,
      recordId: record.id,
    };
  } catch (error) {
    const reason = `OpenAI structured output failed: ${getErrorMessage(error)}`;
    addReason(reasons, reason);

    try {
      const eventLog = await eventService.recordEvent({
        orgId,
        entityId,
        sourceType: "agent",
        factType: "general",
        payloadJson: { inputText, reasons },
        status: "rejected",
        toolName: "memory_write_gate",
      });

      await prisma.memoryRejected.create({
        data: {
          orgId,
          entityId,
          factType: "unknown",
          sourceType: "agent",
          payloadJson: { inputText, reasons } as Prisma.InputJsonValue,
          rejectionReason: reason,
          requestId,
          eventLogId: eventLog.id,
        },
      });

      return {
        decision: "rejected",
        structuredMemoryWrite: null,
        reasons,
        eventLogId: eventLog.id,
      };
    } catch {
      return {
        decision: "rejected",
        structuredMemoryWrite: null,
        reasons,
      };
    }
  }
}
