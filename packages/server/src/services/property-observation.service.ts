import "server-only";

import { replaceKnowledgeEntry } from "../search/knowledge-base.service";

import { capturePropertyLearningObservation } from "./property-learning-control-plane.service";

export type PropertyObservationType = "parcel_lookup" | "prospect_match";

export type PropertyObservationInput = {
  orgId: string;
  observationType: PropertyObservationType;
  parcelId: string;
  address: string;
  parish?: string | null;
  owner?: string | null;
  zoning?: string | null;
  floodZone?: string | null;
  acreage?: number | null;
  lat?: number | null;
  lng?: number | null;
  sourceRoute: string;
};

type PropertyObservationResult = {
  captured: number;
  durableObservations: number;
  verifiedCandidates: number;
};

function buildObservationSourceId(input: PropertyObservationInput): string {
  return `property_observation:${input.observationType}:${input.parcelId}`;
}

export async function capturePropertyObservations(
  observations: PropertyObservationInput[],
): Promise<PropertyObservationResult> {
  let durableObservations = 0;
  let verifiedCandidates = 0;

  await Promise.all(
    observations.slice(0, 25).map(async (observation) => {
      const captured = await capturePropertyLearningObservation(observation);

      if (!captured) {
        return;
      }

      durableObservations += 1;
      verifiedCandidates += captured.verifiedCandidateCount;

      await replaceKnowledgeEntry(
        observation.orgId,
        "agent_analysis",
        buildObservationSourceId(observation),
        captured.knowledgeText,
        {
          ...captured.knowledgeMetadata,
          propertyObservationId: captured.observationId,
          propertyProfileId: captured.profileId,
          propertyCandidateCount: captured.candidateCount,
          propertyVerifiedCandidateCount: captured.verifiedCandidateCount,
          propertyEvalCount: captured.evalCount,
        },
      );
    }),
  );

  return {
    captured: durableObservations,
    durableObservations,
    verifiedCandidates,
  };
}
