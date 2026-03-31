import type { Prisma } from "@entitlement-os/db";
import { z } from "zod";
import {
  ADJACENT_DISTANCE_FEET,
  AiOutputInputSchema,
  DAY_MS,
  EARTH_RADIUS_MILES,
  FEET_PER_MILE,
  IsoDateTimeSchema,
  JsonRecordSchema,
  MarketOverlayStateInputSchema,
  NEARBY_DISTANCE_FEET,
  OutreachChannelSchema,
  OutreachStatusSchema,
  OverlaySelectionInputSchema,
  PolygonCoordinatesSchema,
} from "./map-workspace.schemas";

export function buildResourceStatus(
  kind: "ready" | "fallback",
  source: "api",
  title: string,
  detail: string,
) {
  return { kind, source, title, detail };
}

export function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function readSelectedParcelIds(value: Prisma.JsonValue | null | undefined): string[] {
  const parsed = z.array(z.string()).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function parsePolygonCoordinates(value: Prisma.JsonValue | null | undefined) {
  if (!value) return null;
  const parsed = PolygonCoordinatesSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseAiOutputs(value: Prisma.JsonValue | null | undefined) {
  const parsed = z
    .array(
      z.object({
        id: z.string().uuid(),
        title: z.string(),
        createdAt: IsoDateTimeSchema,
        summary: z.string(),
        payload: JsonRecordSchema,
      }),
    )
    .safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function parseOverlaySelections(value: Prisma.JsonValue | null | undefined) {
  const parsed = z.array(OverlaySelectionInputSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function parseMarketOverlayState(value: Prisma.JsonValue | null | undefined) {
  const parsed = z.array(MarketOverlayStateInputSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function parseAdjustmentNotes(value: Prisma.JsonValue) {
  const parsed = z.array(z.string()).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function parseOutreachChannel(value: string) {
  return OutreachChannelSchema.catch("call").parse(value);
}

export function parseOutreachStatus(value: string) {
  return OutreachStatusSchema.catch("attempted").parse(value);
}

export function parseSkipTraceProvider(value: Prisma.JsonValue) {
  const parsed = z
    .object({
      provider: z.string().trim().min(1).max(100).nullable().optional(),
    })
    .safeParse(value);
  return parsed.success ? parsed.data.provider ?? null : null;
}

export function parsePortfolioCount(
  contacts: ReadonlyArray<{ portfolioContext: Prisma.JsonValue | null }>,
) {
  return contacts.reduce((maxCount, contact) => {
    const parsed = z
      .object({
        portfolioCount: z.number().int().nonnegative().optional(),
        holdings: z.array(z.unknown()).optional(),
      })
      .safeParse(contact.portfolioContext);
    if (!parsed.success) return maxCount;
    if (typeof parsed.data.portfolioCount === "number") {
      return Math.max(maxCount, parsed.data.portfolioCount);
    }
    return parsed.data.holdings ? Math.max(maxCount, parsed.data.holdings.length) : maxCount;
  }, 0);
}

export function decimalToNumber(value: Prisma.Decimal | null) {
  return value ? Number(value) : null;
}

export function toDecimal(value: number | null) {
  return value;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function distanceFeet(
  left: { lat: number | null; lng: number | null },
  right: { lat: number | null; lng: number | null },
) {
  if (left.lat === null || left.lng === null || right.lat === null || right.lng === null) {
    return null;
  }
  const lat1 = toRadians(left.lat);
  const lat2 = toRadians(right.lat);
  const deltaLat = toRadians(right.lat - left.lat);
  const deltaLng = toRadians(right.lng - left.lng);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return roundNumber(EARTH_RADIUS_MILES * c * FEET_PER_MILE, 1);
}

export function buildAdjacencyEdges(
  nodes: Array<{
    parcelId: string;
    lat: number | null;
    lng: number | null;
  }>,
) {
  const edges: Array<{
    fromParcelId: string;
    toParcelId: string;
    distanceFeet: number;
    adjacencyState: "adjacent" | "nearby";
  }> = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const left = nodes[index];
    if (!left) continue;
    for (let cursor = index + 1; cursor < nodes.length; cursor += 1) {
      const right = nodes[cursor];
      if (!right) continue;
      const feet = distanceFeet(left, right);
      if (feet === null || feet > NEARBY_DISTANCE_FEET) continue;
      edges.push({
        fromParcelId: left.parcelId,
        toParcelId: right.parcelId,
        distanceFeet: feet,
        adjacencyState: feet <= ADJACENT_DISTANCE_FEET ? "adjacent" : "nearby",
      });
    }
  }
  return edges;
}

export function buildAssemblageSuggestions(
  owners: Array<{
    ownerName: string;
    parcelIds: string[];
    combinedAcreage: number;
  }>,
  nodes: Array<{ parcelId: string; acreage: number | null }>,
) {
  if (nodes.length === 0) return [];
  const totalAcreage = sumNumbers(nodes.map((node) => node.acreage ?? 0));
  const suggestions: Array<{
    id: string;
    label: string;
    parcelIds: string[];
    combinedAcreage: number;
    ownerCount: number;
    holdoutRisk: "low" | "moderate" | "high";
    rationale: string[];
  }> = owners.slice(0, 3).map((owner, index) => ({
    id: `owner-cluster-${index + 1}`,
    label: `${owner.ownerName} cluster`,
    parcelIds: owner.parcelIds,
    combinedAcreage: owner.combinedAcreage,
    ownerCount: 1,
    holdoutRisk: "low" as const,
    rationale: [
      "Single-owner cluster reduces holdout complexity.",
      `${owner.parcelIds.length} parcel(s) already align under one owner rollup.`,
    ],
  }));
  suggestions.push({
    id: "full-selection",
    label: "Full selected assemblage",
    parcelIds: nodes.map((node) => node.parcelId),
    combinedAcreage: roundNumber(totalAcreage, 4),
    ownerCount: owners.length,
    holdoutRisk: owners.length <= 1 ? "low" : owners.length <= 3 ? "moderate" : "high",
    rationale: [
      `${nodes.length} selected parcel(s) contribute to the candidate assemblage.`,
      owners.length <= 1
        ? "All selected parcels are concentrated under one owner."
        : `${owners.length} owners are involved, which raises coordination risk.`,
    ],
  });
  return suggestions;
}

export function weightedAverage(entries: Array<{ value: number; weight: number }>) {
  if (entries.length === 0) return null;
  const weightSum = sumNumbers(entries.map((entry) => entry.weight));
  if (weightSum === 0) return null;
  return roundNumber(
    sumNumbers(entries.map((entry) => entry.value * entry.weight)) / weightSum,
    2,
  );
}

export function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? roundNumber((sorted[middle - 1]! + sorted[middle]!) / 2, 2)
    : roundNumber(sorted[middle]!, 2);
}

export function monthsSince(date: string) {
  return Math.floor((Date.now() - new Date(date).getTime()) / (DAY_MS * 30.4375));
}

export function sumNumbers(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0);
}

export function roundNumber(value: number, precision: number) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export function formatDateLabel(isoString: string) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "Unscheduled";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function mapHoldoutRiskToSnapshot(value: "low" | "moderate" | "high") {
  if (value === "moderate") {
    return "medium" as const;
  }
  return value;
}
