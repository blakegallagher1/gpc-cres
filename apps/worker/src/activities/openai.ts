import { prisma, type Prisma } from "@entitlement-os/db";
import { createStrictJsonResponse } from "@entitlement-os/openai";
import {
  ParcelTriageSchema,
  buildOpportunityScorecard,
  buildDeterministicRerunDecision,
  computeThroughputRouting,
  zodToOpenAiJsonSchema,
  type OpportunityScorecard,
  type SkuType,
} from "@entitlement-os/shared";

const PARISH_PACK_MODEL = process.env.OPENAI_FLAGSHIP_MODEL || "o3";
const TRIAGE_MODEL = process.env.OPENAI_STANDARD_MODEL || "gpt-4.1";

/**
 * Generate a parish pack JSON from extracted evidence texts using OpenAI.
 */
export async function generateParishPack(params: {
  jurisdictionId: string;
  sku: SkuType;
  orgId: string;
  evidenceTexts: string[];
}): Promise<Record<string, unknown>> {
  const combinedEvidence = params.evidenceTexts
    .map((text, i) => `--- Source ${i + 1} ---\n${text}`)
    .join("\n\n");

  const response = await createStrictJsonResponse<Record<string, unknown>>({
    model: PARISH_PACK_MODEL,
    input: [
      {
        role: "system",
        content: `You are a CRE entitlement analyst. Analyze the following municipal/county source documents and produce a structured parish pack for jurisdiction ${params.jurisdictionId}, SKU type ${params.sku}. Extract: zoning codes, setbacks, height limits, parking ratios, permitted uses, conditional use requirements, application fees, review timelines, hearing procedures, and any special overlay districts.`,
      },
      {
        role: "user",
        content: combinedEvidence,
      },
    ],
    jsonSchema: {
      name: "parish_pack",
      strict: true,
      schema: {
        type: "object",
        properties: {
          jurisdictionId: { type: "string" },
          sku: { type: "string" },
          zoningCodes: { type: "array", items: { type: "object", additionalProperties: true } },
          setbacks: { type: "object", additionalProperties: true },
          heightLimits: { type: "object", additionalProperties: true },
          parkingRatios: { type: "object", additionalProperties: true },
          permittedUses: { type: "array", items: { type: "string" } },
          conditionalUseRequirements: { type: "array", items: { type: "string" } },
          applicationFees: { type: "object", additionalProperties: true },
          reviewTimelines: { type: "object", additionalProperties: true },
          hearingProcedures: { type: "array", items: { type: "string" } },
          overlayDistricts: { type: "array", items: { type: "object", additionalProperties: true } },
          notes: { type: "string" },
        },
        required: [
          "jurisdictionId",
          "sku",
          "zoningCodes",
          "setbacks",
          "heightLimits",
          "parkingRatios",
          "permittedUses",
          "conditionalUseRequirements",
          "applicationFees",
          "reviewTimelines",
          "hearingProcedures",
          "overlayDistricts",
          "notes",
        ],
        additionalProperties: false,
      },
    },
  });

  return response.outputJson;
}

/**
 * Run AI-powered parcel triage for a deal.
 * Analyzes the deal's parcel data and produces a triage assessment.
 */
export async function runParcelTriage(params: {
  dealId: string;
  orgId: string;
  runId: string;
}): Promise<{
  triageScore: number;
  summary: string;
  scorecard: OpportunityScorecard;
  routing: ReturnType<typeof computeThroughputRouting>;
  rerun: { reusedPreviousRun: boolean; reason: string };
}> {
  const deal = await prisma.deal.findFirstOrThrow({
    where: { id: params.dealId, orgId: params.orgId },
    include: { parcels: true },
  });

  const rerunPayload = {
    dealId: deal.id,
    dealName: deal.name,
    sku: deal.sku,
    jurisdictionId: deal.jurisdictionId,
    parcels: deal.parcels.map((parcel) => ({
      id: parcel.id,
      apn: parcel.apn,
      address: parcel.address,
      acreage: parcel.acreage?.toString() ?? null,
      currentZoning: parcel.currentZoning,
      floodZone: parcel.floodZone,
      soilsNotes: parcel.soilsNotes,
      wetlandsNotes: parcel.wetlandsNotes,
      envNotes: parcel.envNotes,
      utilitiesNotes: parcel.utilitiesNotes,
      trafficNotes: parcel.trafficNotes,
    })),
  };

  const previousSucceededRun = await prisma.run.findFirst({
    where: {
      orgId: params.orgId,
      dealId: params.dealId,
      runType: "TRIAGE",
      status: "succeeded",
      id: { not: params.runId },
    },
    orderBy: { finishedAt: "desc" },
    select: {
      id: true,
      inputHash: true,
      outputJson: true,
    },
  });

  const rerunDecision = buildDeterministicRerunDecision({
    runType: "TRIAGE",
    dealId: params.dealId,
    orgId: params.orgId,
    payload: rerunPayload,
    previousInputHash: previousSucceededRun?.inputHash,
  });

  if (rerunDecision.shouldReuse && previousSucceededRun?.outputJson) {
    const cachedOutput = previousSucceededRun.outputJson as Record<string, unknown>;
    const cachedTriageScore = Number(cachedOutput.triageScore);
    const cachedSummary = String(cachedOutput.summary ?? "Reused previous deterministic triage run.");
    const cachedScorecard = cachedOutput.scorecard as OpportunityScorecard | undefined;
    const cachedRouting = cachedOutput.routing as ReturnType<typeof computeThroughputRouting> | undefined;

    if (
      Number.isFinite(cachedTriageScore) &&
      cachedScorecard &&
      cachedRouting
    ) {
      await prisma.run.update({
        where: { id: params.runId },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
          inputHash: rerunDecision.inputHash,
          outputJson: {
            ...cachedOutput,
            rerun: {
              reusedPreviousRun: true,
              sourceRunId: previousSucceededRun.id,
              reason: rerunDecision.reason,
            },
          } as Prisma.InputJsonValue,
        },
      });

      return {
        triageScore: cachedTriageScore,
        summary: cachedSummary,
        scorecard: cachedScorecard,
        routing: cachedRouting,
        rerun: { reusedPreviousRun: true, reason: rerunDecision.reason },
      };
    }
  }

  const parcelDescriptions = deal.parcels
    .map(
      (p) =>
        `Parcel ${p.apn ?? p.id}: ${p.address ?? "no address"}, zoning: ${p.currentZoning ?? "unknown"}`,
    )
    .join("\n");

  const response = await createStrictJsonResponse({
    model: TRIAGE_MODEL,
    input: [
      {
        role: "system",
        content: "You are a CRE deal triage analyst. Produce a strict parcel triage object.",
      },
      {
        role: "user",
        content: [
          `Deal: ${deal.name}`,
          `SKU: ${deal.sku}`,
          `Jurisdiction: ${deal.jurisdictionId}`,
          "Provide KILL/HOLD/ADVANCE recommendation with clear rationale and stage actions.",
          `Deal ID: ${deal.id}`,
          `Generated at: ${new Date().toISOString()}`,
          "",
          "Parcels:",
          parcelDescriptions,
        ].join("\n"),
      },
    ],
    jsonSchema: zodToOpenAiJsonSchema("ParcelTriage", ParcelTriageSchema),
  });

  const triage = ParcelTriageSchema.parse({
    ...(response.outputJson as Record<string, unknown>),
    generated_at: (response.outputJson as Record<string, unknown>).generated_at ?? new Date().toISOString(),
    deal_id: (response.outputJson as Record<string, unknown>).deal_id ?? deal.id,
  });

  const avgRisk =
    Object.values(triage.risk_scores).reduce((sum, value) => sum + value, 0) /
    Math.max(Object.keys(triage.risk_scores).length, 1);
  const triageScore = Math.round(((10 - avgRisk) / 10) * 10000) / 100;
  const summary = `${triage.decision}: ${triage.rationale}`;

  const scorecard = buildOpportunityScorecard({
    dealId: params.dealId,
    triage,
    rerunPolicy: {
      input_hash: rerunDecision.inputHash,
      deterministic: true,
      rerun_reason: rerunDecision.reason,
    },
  });

  const routing = computeThroughputRouting({
    parcelCount: deal.parcels.length,
    avgRiskScore: avgRisk,
    disqualifierCount: triage.disqualifiers.length,
    confidence: scorecard.overall_confidence,
    missingDataCount: triage.assumptions.filter((item) => item.sources == null).length,
  });

  const outputPayload = {
    triageScore,
    summary,
    triage,
    scorecard,
    routing,
    rerun: { reusedPreviousRun: false, reason: rerunDecision.reason },
  };

  await prisma.run.update({
    where: { id: params.runId },
    data: {
      status: "succeeded",
      finishedAt: new Date(),
      inputHash: rerunDecision.inputHash,
      outputJson: outputPayload,
      openaiResponseId: response.responseId,
    },
  });

  return {
    triageScore,
    summary,
    scorecard,
    routing,
    rerun: { reusedPreviousRun: false, reason: rerunDecision.reason },
  };
}
