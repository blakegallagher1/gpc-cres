import { prisma } from "@entitlement-os/db";
import { createStrictJsonResponse } from "@entitlement-os/openai";
import type { SkuType } from "@entitlement-os/shared";

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
}): Promise<{ triageScore: number; summary: string }> {
  const deal = await prisma.deal.findUniqueOrThrow({
    where: { id: params.dealId },
    include: { parcels: true },
  });

  const parcelDescriptions = deal.parcels
    .map(
      (p) =>
        `Parcel ${p.apn ?? p.id}: ${p.address ?? "no address"}, zoning: ${p.currentZoning ?? "unknown"}`,
    )
    .join("\n");

  const response = await createStrictJsonResponse<{
    triageScore: number;
    summary: string;
  }>({
    model: TRIAGE_MODEL,
    input: [
      {
        role: "system",
        content:
          "You are a CRE deal triage analyst. Assess the following deal and parcels. Provide a triage score (0-100) and a brief summary of key risks and opportunities.",
      },
      {
        role: "user",
        content: `Deal: ${deal.name}\nSKU: ${deal.sku}\nJurisdiction: ${deal.jurisdictionId}\n\nParcels:\n${parcelDescriptions}`,
      },
    ],
    jsonSchema: {
      name: "triage_result",
      strict: true,
      schema: {
        type: "object",
        properties: {
          triageScore: { type: "number" },
          summary: { type: "string" },
        },
        required: ["triageScore", "summary"],
        additionalProperties: false,
      },
    },
  });

  // Store triage result on the run record
  await prisma.run.update({
    where: { id: params.runId },
    data: {
      outputJson: response.outputJson,
    },
  });

  return response.outputJson;
}
