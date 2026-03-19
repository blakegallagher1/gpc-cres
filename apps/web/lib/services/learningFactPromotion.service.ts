import "server-only";

import { prisma, type Prisma } from "@entitlement-os/db";

import { AUTOMATION_CONFIG } from "@/lib/automation/config";
import { memoryWriteGate } from "@/lib/services/memoryWriteGate";

export type PromoteCandidateFactsInput = {
  orgId: string;
  runId: string;
  dealId?: string | null;
  jurisdictionId?: string | null;
  status: "succeeded" | "failed" | "canceled";
};

export type PromoteCandidateFactsResult = {
  attempted: number;
  verified: number;
  drafted: number;
  rejected: number;
};

type JsonRecord = Record<string, unknown>;
type WriteContext = {
  entityId: string;
  orgId: string;
  address?: string;
  parcelId?: string;
};
type CandidateFact = {
  factClass: "comp" | "lender_term" | "zoning_or_entitlement" | "property_screening";
  inputText: string;
};

const MAX_FACT_CANDIDATES = 4;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toJsonRecord(value: Prisma.JsonValue | null | undefined): JsonRecord {
  return isRecord(value) ? value : {};
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function extractConfidence(outputJson: JsonRecord): number {
  return typeof outputJson.confidence === "number" && Number.isFinite(outputJson.confidence)
    ? outputJson.confidence
    : 0;
}

function buildCorpus(outputJson: JsonRecord): string[] {
  const structuredSections = [
    outputJson.finalOutput,
    isRecord(outputJson.finalReport) ? JSON.stringify(outputJson.finalReport, null, 2) : null,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 24 && line.length <= 320);

  return Array.from(new Set(structuredSections));
}

function buildCorrectionPrompt(attributeKey: string, line: string): string {
  return [
    "Correction for the linked property/entity.",
    `Corrected attribute key: ${attributeKey}`,
    `Corrected value: ${line}`,
    "Correction reason: High-confidence completed agent run with supporting evidence and no missing evidence.",
  ].join("\n");
}

function buildCompPrompt(line: string): string {
  return [
    "Comp addition or correction for the linked property/entity.",
    line,
  ].join("\n");
}

function buildLenderPrompt(line: string): string {
  return [
    "Lender term addition or correction for the linked property/entity.",
    line,
  ].join("\n");
}

function inferScreeningAttributeKey(line: string): string {
  if (/flood/i.test(line)) return "screening_flood";
  if (/wetland/i.test(line)) return "screening_wetlands";
  if (/soil/i.test(line)) return "screening_soils";
  if (/traffic/i.test(line)) return "screening_traffic";
  if (/epa|environmental/i.test(line)) return "screening_environmental";
  return "property_screening";
}

function extractWhitelistedFactCandidates(outputJson: JsonRecord): CandidateFact[] {
  const lines = buildCorpus(outputJson);
  const candidates: CandidateFact[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const lower = line.toLowerCase();
    let candidate: CandidateFact | null = null;

    if (
      /\b(comp|comparable|sale price|sold for|cap rate|noi|price per unit)\b/i.test(line) &&
      /(\$[\d,.]+|\b\d+(?:\.\d+)?%)/.test(line)
    ) {
      candidate = {
        factClass: "comp",
        inputText: buildCompPrompt(line),
      };
    } else if (
      /\b(lender|ltv|dscr|rate bps|amortization|term months|recourse|prepayment)\b/i.test(line)
    ) {
      candidate = {
        factClass: "lender_term",
        inputText: buildLenderPrompt(line),
      };
    } else if (
      /\b(zoning|entitlement|rezoning|cup|conditional use|approved|denied|rejected|permit)\b/i.test(line)
    ) {
      candidate = {
        factClass: "zoning_or_entitlement",
        inputText: buildCorrectionPrompt("zoning_or_entitlement_outcome", line),
      };
    } else if (
      /\b(flood|wetland|soil|traffic|epa|environmental|screening)\b/i.test(line) &&
      /\b(correct|correction|updated|confirmed|screen)\b/i.test(line)
    ) {
      candidate = {
        factClass: "property_screening",
        inputText: buildCorrectionPrompt(inferScreeningAttributeKey(line), line),
      };
    }

    if (!candidate) continue;
    if (seen.has(candidate.inputText)) continue;
    seen.add(candidate.inputText);
    candidates.push(candidate);

    if (candidates.length >= MAX_FACT_CANDIDATES) {
      break;
    }
  }

  return candidates;
}

async function resolveEntityContext(params: {
  orgId: string;
  dealId?: string | null;
}): Promise<WriteContext | null> {
  if (!params.dealId) {
    return null;
  }

  const deal = await prisma.deal.findFirst({
    where: {
      id: params.dealId,
      orgId: params.orgId,
    },
    select: {
      outcome: {
        select: {
          entityId: true,
        },
      },
      parcels: {
        select: {
          id: true,
          address: true,
        },
        take: 1,
      },
    },
  });

  if (!deal) {
    return null;
  }

  if (deal.outcome?.entityId) {
    const entity = await prisma.internalEntity.findFirst({
      where: {
        id: deal.outcome.entityId,
        orgId: params.orgId,
      },
      select: {
        id: true,
        canonicalAddress: true,
        parcelId: true,
      },
    });

    if (entity) {
      return {
        entityId: entity.id,
        orgId: params.orgId,
        address: entity.canonicalAddress ?? undefined,
        parcelId: entity.parcelId ?? undefined,
      };
    }
  }

  const firstParcel = deal.parcels[0];
  if (!firstParcel) {
    return null;
  }

  const entity = await prisma.internalEntity.findFirst({
    where: {
      orgId: params.orgId,
      parcelId: firstParcel.id,
    },
    select: {
      id: true,
      canonicalAddress: true,
      parcelId: true,
    },
  });

  if (!entity) {
    return null;
  }

  return {
    entityId: entity.id,
    orgId: params.orgId,
    address: entity.canonicalAddress ?? firstParcel.address ?? undefined,
    parcelId: entity.parcelId ?? firstParcel.id,
  };
}

export async function promoteCandidateFactsFromRun(
  input: PromoteCandidateFactsInput,
): Promise<PromoteCandidateFactsResult> {
  const result: PromoteCandidateFactsResult = {
    attempted: 0,
    verified: 0,
    drafted: 0,
    rejected: 0,
  };

  if (input.status !== "succeeded") {
    return result;
  }

  const run = await prisma.run.findFirst({
    where: {
      id: input.runId,
      orgId: input.orgId,
    },
    select: {
      outputJson: true,
      dealId: true,
    },
  });

  if (!run) {
    return result;
  }

  const outputJson = toJsonRecord(run.outputJson);
  const confidence = extractConfidence(outputJson);
  const missingEvidence = getStringArray(outputJson.missingEvidence);

  if (confidence < AUTOMATION_CONFIG.agentLearning.minConfidenceForFactPromotion) {
    return result;
  }

  if (missingEvidence.length > 0) {
    return result;
  }

  const entityContext = await resolveEntityContext({
    orgId: input.orgId,
    dealId: input.dealId ?? run.dealId ?? null,
  });

  if (!entityContext) {
    return result;
  }

  const candidates = extractWhitelistedFactCandidates(outputJson);

  for (const candidate of candidates) {
    result.attempted += 1;

    try {
      const writeResult = await memoryWriteGate(candidate.inputText, entityContext);
      if (writeResult.decision === "verified") {
        result.verified += 1;
      } else if (writeResult.decision === "draft") {
        result.drafted += 1;
      } else {
        result.rejected += 1;
      }
    } catch {
      result.rejected += 1;
    }
  }

  return result;
}
