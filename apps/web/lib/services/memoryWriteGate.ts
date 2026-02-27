import "server-only";
import { prisma } from "@entitlement-os/db";
import type { Prisma } from "@entitlement-os/db";
import { createStrictJsonResponse } from "@entitlement-os/openai";
import {
  MemoryWriteSchema,
  memoryWriteJsonSchema,
  type MemoryWrite,
  type CorrectionPayload,
} from "@/lib/schemas/memoryWrite";
import { detectConflicts } from "./conflictDetection";
import { applyCorrection } from "./correctionService";
import { getMemoryEventService } from "./memoryEventService";
import { generateRequestId } from "@/lib/server/requestContext";
import { assignTier } from "./memoryTierService";

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

const MEMORY_WRITE_GATE_MODEL = "gpt-4o-mini";

function addReason(reasons: string[], reason: string) {
  reasons.push(reason);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function memoryWriteGate(
  inputText: string,
  entityContext: WriteContext,
): Promise<WriteGateResult> {
  const requestId = generateRequestId();
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
