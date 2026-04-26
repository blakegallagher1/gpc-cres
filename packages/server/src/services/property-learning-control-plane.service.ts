import "server-only";

import { createHash } from "node:crypto";

import { prisma, type Prisma } from "@entitlement-os/db";

import { normalizeAddress } from "./entity-resolution.service";

export type PropertyLearningObservationType = "parcel_lookup" | "prospect_match";

export type PropertyLearningObservationInput = {
  orgId: string;
  observationType: PropertyLearningObservationType;
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

export type PropertyLearningCaptureResult = {
  observationId: string;
  profileId: string;
  propertyKey: string;
  observationKey: string;
  sourceHash: string;
  candidateCount: number;
  verifiedCandidateCount: number;
  evalCount: number;
  knowledgeText: string;
  knowledgeMetadata: Prisma.InputJsonObject;
};

const PROPERTY_LEARNING_GRADER_VERSION = "property-learning-v1";
const MIN_VERIFIED_SCORE = 0.8;

type NormalizedPropertyLearningObservation = Omit<
  PropertyLearningObservationInput,
  "parcelId" | "address" | "parish" | "owner" | "zoning" | "floodZone" | "acreage" | "lat" | "lng"
> & {
  parcelId: string;
  address: string;
  canonicalAddress: string;
  parish: string | null;
  owner: string | null;
  zoning: string | null;
  floodZone: string | null;
  acreage: number | null;
  lat: number | null;
  lng: number | null;
};

type PropertyFactCandidate = {
  candidateType: string;
  statement: string;
  payloadJson: Prisma.InputJsonObject;
  confidence: number;
};

type CandidateGrade = {
  score: number;
  passed: boolean;
  gradeJson: Prisma.InputJsonObject;
  rejectionReason: string | null;
};

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeObservation(
  input: PropertyLearningObservationInput,
): NormalizedPropertyLearningObservation | null {
  const parcelId = normalizeString(input.parcelId);
  const address = normalizeString(input.address);

  if (!parcelId || !address) {
    return null;
  }

  return {
    ...input,
    parcelId,
    address,
    canonicalAddress: normalizeAddress(address),
    parish: normalizeString(input.parish),
    owner: normalizeString(input.owner),
    zoning: normalizeString(input.zoning),
    floodZone: normalizeString(input.floodZone),
    acreage: normalizeNumber(input.acreage),
    lat: normalizeNumber(input.lat),
    lng: normalizeNumber(input.lng),
  };
}

function buildPropertyKey(observation: NormalizedPropertyLearningObservation): string {
  return `parcel:${observation.parcelId.toLowerCase()}`;
}

function buildObservationKey(observation: NormalizedPropertyLearningObservation): string {
  return `${observation.observationType}:${observation.parcelId.toLowerCase()}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const fields = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);

  return `{${fields.join(",")}}`;
}

function hashPayload(payload: Prisma.InputJsonObject): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function buildObservationPayload(
  observation: NormalizedPropertyLearningObservation,
): Prisma.InputJsonObject {
  return {
    observationType: observation.observationType,
    parcelId: observation.parcelId,
    address: observation.address,
    canonicalAddress: observation.canonicalAddress,
    parish: observation.parish,
    owner: observation.owner,
    zoning: observation.zoning,
    floodZone: observation.floodZone,
    acreage: observation.acreage,
    coordinates:
      observation.lat !== null && observation.lng !== null
        ? { lat: observation.lat, lng: observation.lng }
        : null,
    sourceRoute: observation.sourceRoute,
  };
}

function buildObservationText(observation: NormalizedPropertyLearningObservation): string {
  const lines = [
    `Observation type: ${observation.observationType}`,
    `Parcel ID: ${observation.parcelId}`,
    `Address: ${observation.address}`,
  ];

  if (observation.parish) lines.push(`Parish: ${observation.parish}`);
  if (observation.owner) lines.push(`Owner: ${observation.owner}`);
  if (observation.zoning) lines.push(`Zoning: ${observation.zoning}`);
  if (observation.floodZone) lines.push(`Flood zone: ${observation.floodZone}`);
  if (observation.acreage !== null) lines.push(`Acreage: ${observation.acreage}`);
  if (observation.lat !== null && observation.lng !== null) {
    lines.push(`Coordinates: ${observation.lat}, ${observation.lng}`);
  }

  return lines.join("\n");
}

function buildFactCandidates(
  observation: NormalizedPropertyLearningObservation,
): PropertyFactCandidate[] {
  const candidates: PropertyFactCandidate[] = [];

  if (observation.owner) {
    candidates.push({
      candidateType: "owner",
      statement: `${observation.parcelId} owner is ${observation.owner}.`,
      payloadJson: { owner: observation.owner },
      confidence: 0.82,
    });
  }

  if (observation.zoning) {
    candidates.push({
      candidateType: "zoning",
      statement: `${observation.parcelId} zoning is ${observation.zoning}.`,
      payloadJson: { zoning: observation.zoning },
      confidence: 0.8,
    });
  }

  if (observation.floodZone) {
    candidates.push({
      candidateType: "flood_zone",
      statement: `${observation.parcelId} flood zone is ${observation.floodZone}.`,
      payloadJson: { floodZone: observation.floodZone },
      confidence: 0.78,
    });
  }

  if (observation.acreage !== null) {
    candidates.push({
      candidateType: "acreage",
      statement: `${observation.parcelId} acreage is ${observation.acreage}.`,
      payloadJson: { acreage: observation.acreage },
      confidence: 0.84,
    });
  }

  if (observation.parish) {
    candidates.push({
      candidateType: "parish",
      statement: `${observation.parcelId} parish is ${observation.parish}.`,
      payloadJson: { parish: observation.parish },
      confidence: 0.85,
    });
  }

  return candidates;
}

function gradeCandidate(candidate: PropertyFactCandidate, sourceHash: string): CandidateGrade {
  const checks = {
    hasStatement: candidate.statement.trim().length >= 12,
    hasPayload: Object.keys(candidate.payloadJson).length > 0,
    hasSourceHash: sourceHash.length === 64,
    confidence: candidate.confidence >= 0.72,
  };
  const passedChecks = Object.values(checks).filter(Boolean).length;
  const score = passedChecks / Object.keys(checks).length;
  const passed = score >= MIN_VERIFIED_SCORE;

  return {
    score,
    passed,
    gradeJson: {
      graderVersion: PROPERTY_LEARNING_GRADER_VERSION,
      checks,
      score,
      passed,
    },
    rejectionReason: passed ? null : "property_candidate_failed_deterministic_grade",
  };
}

function buildProfileFacts(
  observation: NormalizedPropertyLearningObservation,
): Prisma.InputJsonObject {
  return {
    parcelId: observation.parcelId,
    canonicalAddress: observation.canonicalAddress,
    parish: observation.parish,
    owner: observation.owner,
    zoning: observation.zoning,
    floodZone: observation.floodZone,
    acreage: observation.acreage,
  };
}

function buildProfileSignals(
  observation: NormalizedPropertyLearningObservation,
  sourceHash: string,
): Prisma.InputJsonObject {
  return {
    latestObservationType: observation.observationType,
    latestSourceRoute: observation.sourceRoute,
    latestSourceHash: sourceHash,
    learningControlPlane: true,
  };
}

function buildKnowledgeMetadata(
  observation: NormalizedPropertyLearningObservation,
  propertyKey: string,
  sourceHash: string,
): Prisma.InputJsonObject {
  return {
    entityType: "property",
    propertyKey,
    parcelId: observation.parcelId,
    canonicalAddress: observation.canonicalAddress,
    observationType: observation.observationType,
    parish: observation.parish,
    owner: observation.owner,
    zoning: observation.zoning,
    floodZone: observation.floodZone,
    acreage: observation.acreage,
    lat: observation.lat,
    lng: observation.lng,
    sourceRoute: observation.sourceRoute,
    sourceHash,
    learningControlPlane: true,
  };
}

export async function capturePropertyLearningObservation(
  input: PropertyLearningObservationInput,
): Promise<PropertyLearningCaptureResult | null> {
  const observation = normalizeObservation(input);

  if (!observation) {
    return null;
  }

  const propertyKey = buildPropertyKey(observation);
  const observationKey = buildObservationKey(observation);
  const payloadJson = buildObservationPayload(observation);
  const sourceHash = hashPayload(payloadJson);
  const knowledgeText = buildObservationText(observation);

  const propertyObservation = await prisma.propertyObservation.upsert({
    where: { orgId_observationKey: { orgId: observation.orgId, observationKey } },
    create: {
      orgId: observation.orgId,
      observationKey,
      observationType: observation.observationType,
      propertyKey,
      parcelId: observation.parcelId,
      canonicalAddress: observation.canonicalAddress,
      sourceRoute: observation.sourceRoute,
      payloadJson,
      sourceHash,
      confidence: 0.75,
      freshnessTier: "live",
    },
    update: {
      propertyKey,
      parcelId: observation.parcelId,
      canonicalAddress: observation.canonicalAddress,
      sourceRoute: observation.sourceRoute,
      payloadJson,
      sourceHash,
      confidence: 0.75,
      freshnessTier: "live",
      observedAt: new Date(),
    },
  });

  const profile = await prisma.propertyProfile.upsert({
    where: { orgId_propertyKey: { orgId: observation.orgId, propertyKey } },
    create: {
      orgId: observation.orgId,
      propertyKey,
      parcelId: observation.parcelId,
      canonicalAddress: observation.canonicalAddress,
      factsJson: buildProfileFacts(observation),
      signalsJson: buildProfileSignals(observation, sourceHash),
      confidence: 0.75,
      lastObservationAt: propertyObservation.observedAt,
      lastSynthesizedAt: new Date(),
    },
    update: {
      parcelId: observation.parcelId,
      canonicalAddress: observation.canonicalAddress,
      factsJson: buildProfileFacts(observation),
      signalsJson: buildProfileSignals(observation, sourceHash),
      confidence: 0.75,
      lastObservationAt: propertyObservation.observedAt,
      lastSynthesizedAt: new Date(),
    },
  });

  let candidateCount = 0;
  let verifiedCandidateCount = 0;
  let evalCount = 0;

  for (const candidate of buildFactCandidates(observation)) {
    const candidateKey = `${observationKey}:${candidate.candidateType}`;
    const grade = gradeCandidate(candidate, sourceHash);
    const status = grade.passed ? "verified" : "draft";

    const learningCandidate = await prisma.propertyLearningCandidate.upsert({
      where: { orgId_candidateKey: { orgId: observation.orgId, candidateKey } },
      create: {
        orgId: observation.orgId,
        observationId: propertyObservation.id,
        profileId: profile.id,
        candidateKey,
        candidateType: candidate.candidateType,
        propertyKey,
        statement: candidate.statement,
        payloadJson: candidate.payloadJson,
        confidence: candidate.confidence,
        status,
        gradeScore: grade.score,
        gradeJson: grade.gradeJson,
        rejectionReason: grade.rejectionReason,
        promotedAt: grade.passed ? new Date() : null,
      },
      update: {
        observationId: propertyObservation.id,
        profileId: profile.id,
        statement: candidate.statement,
        payloadJson: candidate.payloadJson,
        confidence: candidate.confidence,
        status,
        gradeScore: grade.score,
        gradeJson: grade.gradeJson,
        rejectionReason: grade.rejectionReason,
        promotedAt: grade.passed ? new Date() : null,
      },
    });

    await prisma.propertyLearningEval.upsert({
      where: {
        orgId_evalKey: {
          orgId: observation.orgId,
          evalKey: `${candidateKey}:${PROPERTY_LEARNING_GRADER_VERSION}`,
        },
      },
      create: {
        orgId: observation.orgId,
        candidateId: learningCandidate.id,
        evalKey: `${candidateKey}:${PROPERTY_LEARNING_GRADER_VERSION}`,
        graderVersion: PROPERTY_LEARNING_GRADER_VERSION,
        score: grade.score,
        passed: grade.passed,
        gradeJson: grade.gradeJson,
      },
      update: {
        candidateId: learningCandidate.id,
        graderVersion: PROPERTY_LEARNING_GRADER_VERSION,
        score: grade.score,
        passed: grade.passed,
        gradeJson: grade.gradeJson,
      },
    });

    candidateCount += 1;
    evalCount += 1;
    if (grade.passed) verifiedCandidateCount += 1;
  }

  if (verifiedCandidateCount > 0) {
    await prisma.propertyObservation.update({
      where: { id: propertyObservation.id },
      data: { promotedAt: new Date() },
    });
  }

  return {
    observationId: propertyObservation.id,
    profileId: profile.id,
    propertyKey,
    observationKey,
    sourceHash,
    candidateCount,
    verifiedCandidateCount,
    evalCount,
    knowledgeText,
    knowledgeMetadata: buildKnowledgeMetadata(observation, propertyKey, sourceHash),
  };
}
