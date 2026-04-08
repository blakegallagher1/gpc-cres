import { prisma } from "@entitlement-os/db";
import type { Prisma } from "@entitlement-os/db";
import {
  buildOpportunityFeedbackProfile,
  enrichOpportunityMatch,
  type OpportunityMatchForThesis,
  type OpportunityParcelData,
} from "../../../../apps/web/lib/opportunities/thesisEngine";
import { NotFoundError, ValidationError } from "../../../../apps/web/lib/errors";
import {
  getCloudflareAccessHeadersFromEnv,
} from "./property-db-gateway.service";

function getGatewayConfig(): { url: string; key: string } {
  const url = process.env.LOCAL_API_URL?.trim();
  const key = process.env.LOCAL_API_KEY?.trim();
  if (!url || !key) {
    throw new Error("[saved-search-service] Missing LOCAL_API_URL or LOCAL_API_KEY");
  }
  return { url, key };
}

async function propertyDbRpc(fnName: string, body: Record<string, unknown>): Promise<unknown> {
  const { url, key } = getGatewayConfig();
  if (fnName === "api_search_parcels") {
    const q = String(body.p_search_text ?? body.search_text ?? "").trim();
    const parish = String(body.p_parish ?? body.parish ?? "").trim();
    const limit = Number(body.p_limit ?? body.limit_rows ?? 50);
    const params = new URLSearchParams({
      q,
      limit: String(Number.isFinite(limit) ? Math.max(1, Math.min(100, limit)) : 50),
    });
    if (parish) {
      params.set("parish", parish);
    }

    const response = await fetch(`${url}/api/parcels/search?${params.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        ...getCloudflareAccessHeadersFromEnv(),
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Property DB error (${response.status}): ${text}`);
    }
    const payload = (await response.json()) as { data?: unknown[]; parcels?: unknown[] };
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.parcels)) return payload.parcels;
    return [];
  }

  throw new Error(`[saved-search-service] Unsupported propertyDbRpc fnName: ${fnName}`);
}

export interface SearchCriteria {
  parishes?: string[];
  zoningCodes?: string[];
  minAcreage?: number;
  maxAcreage?: number;
  propertyTypes?: string[];
  searchText?: string;
  polygon?: {
    type: "Polygon";
    coordinates: number[][][];
  };
  excludeFloodZone?: boolean;
  minAssessedValue?: number;
  maxAssessedValue?: number;
}

export interface CreateSavedSearchInput {
  orgId: string;
  userId: string;
  name: string;
  criteria: SearchCriteria;
  alertEnabled?: boolean;
  alertFrequency?: "REALTIME" | "DAILY" | "WEEKLY";
}

export interface UpdateSavedSearchInput {
  name?: string;
  criteria?: SearchCriteria;
  alertEnabled?: boolean;
  alertFrequency?: "REALTIME" | "DAILY" | "WEEKLY";
}

interface ParcelResult {
  id: string;
  parish_name: string;
  parcel_uid: string;
  owner_name: string;
  situs_address: string;
  acreage: number | null;
  lat: number | null;
  lng: number | null;
}

function toRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toParcelData(value: Prisma.JsonValue | null | undefined): OpportunityParcelData {
  const record = toRecord(value);
  return {
    parish: toStringOrNull(record.parish),
    parcelUid: toStringOrNull(record.parcelUid),
    ownerName: toStringOrNull(record.ownerName),
    address: toStringOrNull(record.address),
    acreage: toNumberOrNull(record.acreage),
    lat: toNumberOrNull(record.lat),
    lng: toNumberOrNull(record.lng),
  };
}

type OpportunityMatchRow = {
  id: string;
  parcelId: string;
  matchScore: Prisma.Decimal;
  matchedCriteria: Prisma.JsonValue;
  parcelData: Prisma.JsonValue;
  createdAt: Date;
  seenAt: Date | null;
  pursuedAt: Date | null;
  dismissedAt: Date | null;
  savedSearch: { id: string; name: string };
};

function toThesisInput(match: OpportunityMatchRow): OpportunityMatchForThesis {
  return {
    id: match.id,
    parcelId: match.parcelId,
    matchScore: match.matchScore.toString(),
    matchedCriteria: toRecord(match.matchedCriteria),
    parcelData: toParcelData(match.parcelData),
    savedSearch: match.savedSearch,
    createdAt: match.createdAt,
    seenAt: match.seenAt,
    pursuedAt: match.pursuedAt,
    dismissedAt: match.dismissedAt,
  };
}

const MAX_BULK_IDS = 250;

function dedupeIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

interface BulkMatchUpdateResult {
  requested: number;
  updated: number;
  skipped: number;
  ids: string[];
}

interface BulkSavedSearchResult {
  requested: number;
  deleted: number;
  skipped: number;
  ids: string[];
}

interface BulkRunSearchResult {
  requested: number;
  executed: number;
  skipped: number;
  results: Array<{ savedSearchId: string; newMatches: number; totalMatches: number }>;
  errors: Array<{ savedSearchId: string; message: string }>;
}

export class SavedSearchService {
  async create(input: CreateSavedSearchInput) {
    return prisma.savedSearch.create({
      data: {
        orgId: input.orgId,
        userId: input.userId,
        name: input.name,
        criteria: input.criteria as Prisma.InputJsonValue,
        alertEnabled: input.alertEnabled ?? false,
        alertFrequency: input.alertFrequency ?? "DAILY",
        createdBy: input.userId,
      },
      include: { matches: { take: 0 } },
    });
  }

  async getAll(orgId: string, userId: string) {
    return prisma.savedSearch.findMany({
      where: { orgId, userId },
      include: {
        _count: { select: { matches: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getById(id: string, orgId: string, userId: string) {
    const search = await prisma.savedSearch.findFirst({
      where: { id, orgId, userId },
      include: {
        matches: {
          where: { dismissedAt: null },
          orderBy: { matchScore: "desc" },
          take: 50,
        },
        _count: { select: { matches: true } },
      },
    });
    if (!search) throw new NotFoundError("Saved search not found");
    return search;
  }

  async update(id: string, orgId: string, userId: string, input: UpdateSavedSearchInput) {
    const existing = await prisma.savedSearch.findFirst({
      where: { id, orgId, userId },
    });
    if (!existing) throw new NotFoundError("Saved search not found");

    return prisma.savedSearch.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.criteria !== undefined && { criteria: input.criteria as Prisma.InputJsonValue }),
        ...(input.alertEnabled !== undefined && { alertEnabled: input.alertEnabled }),
        ...(input.alertFrequency !== undefined && { alertFrequency: input.alertFrequency }),
      },
    });
  }

  async delete(id: string, orgId: string, userId: string) {
    const existing = await prisma.savedSearch.findFirst({
      where: { id, orgId, userId },
    });
    if (!existing) throw new NotFoundError("Saved search not found");

    await prisma.savedSearch.delete({ where: { id } });
  }

  async runSearch(id: string, orgId: string, userId: string) {
    const search = await prisma.savedSearch.findFirst({
      where: { id, orgId, userId },
      include: { matches: { select: { parcelId: true } } },
    });
    if (!search) throw new NotFoundError("Saved search not found");

    const criteria = search.criteria as unknown as SearchCriteria;
    const existingParcelIds = new Set(search.matches.map((match) => match.parcelId));
    const parcels = await this.queryPropertyDb(criteria);
    const newParcels = parcels.filter((parcel) => !existingParcelIds.has(parcel.id));

    if (newParcels.length === 0) {
      await prisma.savedSearch.update({
        where: { id },
        data: { lastRunAt: new Date() },
      });
      return { newMatches: 0, totalMatches: search.matches.length };
    }

    const matchData = newParcels.map((parcel) => ({
      savedSearchId: id,
      parcelId: parcel.id,
      matchScore: this.scoreMatch(parcel, criteria),
      matchedCriteria: this.buildMatchedCriteria(parcel, criteria) as Prisma.InputJsonValue,
      parcelData: {
        parish: parcel.parish_name,
        parcelUid: parcel.parcel_uid,
        ownerName: parcel.owner_name,
        address: parcel.situs_address,
        acreage: parcel.acreage,
        lat: parcel.lat,
        lng: parcel.lng,
      } as Prisma.InputJsonValue,
    }));

    await prisma.opportunityMatch.createMany({
      data: matchData,
      skipDuplicates: true,
    });

    const totalMatches = search.matches.length + newParcels.length;
    await prisma.savedSearch.update({
      where: { id },
      data: { lastRunAt: new Date(), matchCount: totalMatches },
    });

    return { newMatches: newParcels.length, totalMatches };
  }

  async getOpportunities(
    orgId: string,
    userId: string,
    limit = 20,
    offset = 0,
    savedSearchId?: string,
  ) {
    const searches = await prisma.savedSearch.findMany({
      where: {
        orgId,
        userId,
        ...(savedSearchId ? { id: savedSearchId } : {}),
      },
      select: { id: true },
    });
    const searchIds = searches.map((search) => search.id);

    if (searchIds.length === 0) {
      return { opportunities: [], total: 0 };
    }

    const total = await prisma.opportunityMatch.count({
      where: {
        savedSearchId: { in: searchIds },
        dismissedAt: null,
      },
    });

    const fetchLimit = Math.max(1, Math.min(total, Math.max(200, offset + limit)));

    const [opportunities, feedbackHistory] = await Promise.all([
      prisma.opportunityMatch.findMany({
        where: {
          savedSearchId: { in: searchIds },
          dismissedAt: null,
        },
        include: {
          savedSearch: { select: { id: true, name: true } },
        },
        orderBy: [{ seenAt: { sort: "asc", nulls: "first" } }, { matchScore: "desc" }],
        take: fetchLimit,
      }),
      prisma.opportunityMatch.findMany({
        where: {
          savedSearchId: { in: searchIds },
          OR: [
            { pursuedAt: { not: null } },
            { dismissedAt: { not: null } },
            { seenAt: { not: null } },
          ],
        },
        include: {
          savedSearch: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 250,
      }),
    ]);

    const profile = buildOpportunityFeedbackProfile(
      feedbackHistory.map((match) => toThesisInput(match as OpportunityMatchRow)),
    );
    const rankOrder: Record<string, number> = {
      new: 0,
      pursued: 1,
      seen: 2,
      dismissed: 3,
    };
    const ranked = opportunities
      .map((match) => enrichOpportunityMatch(toThesisInput(match as OpportunityMatchRow), profile))
      .sort((left, right) => {
        const signalDelta = rankOrder[left.feedbackSignal] - rankOrder[right.feedbackSignal];
        if (signalDelta !== 0) return signalDelta;
        if (right.priorityScore !== left.priorityScore) {
          return right.priorityScore - left.priorityScore;
        }
        const matchScoreDelta =
          Number.parseFloat(String(right.matchScore)) - Number.parseFloat(String(left.matchScore));
        if (matchScoreDelta !== 0) return matchScoreDelta;
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      });

    return {
      opportunities: ranked.slice(offset, offset + limit),
      total,
    };
  }

  async markSeenBulk(
    matchIds: string[],
    orgId: string,
    userId: string,
  ): Promise<BulkMatchUpdateResult> {
    const uniqueIds = dedupeIds(matchIds);

    if (uniqueIds.length === 0) {
      throw new ValidationError("At least one match ID is required");
    }

    if (uniqueIds.length > MAX_BULK_IDS) {
      throw new ValidationError(`Too many matches. Limit is ${MAX_BULK_IDS}.`);
    }

    const matches = await prisma.opportunityMatch.findMany({
      where: {
        id: { in: uniqueIds },
        savedSearch: { orgId, userId },
      },
      select: { id: true },
    });

    const matchedIds = matches.map((match) => match.id);
    if (matchedIds.length === 0) {
      return {
        requested: uniqueIds.length,
        updated: 0,
        skipped: uniqueIds.length,
        ids: [],
      };
    }

    const result = await prisma.opportunityMatch.updateMany({
      where: { id: { in: matchedIds } },
      data: { seenAt: new Date() },
    });

    return {
      requested: uniqueIds.length,
      updated: result.count,
      skipped: uniqueIds.length - matchedIds.length,
      ids: matchedIds,
    };
  }

  async markSeen(matchId: string, orgId: string, userId: string) {
    const match = await prisma.opportunityMatch.findFirst({
      where: {
        id: matchId,
        savedSearch: { orgId, userId },
      },
    });
    if (!match) throw new NotFoundError("Match not found");

    return prisma.opportunityMatch.update({
      where: { id: matchId },
      data: { seenAt: new Date() },
    });
  }

  async markPursued(matchId: string, orgId: string, userId: string) {
    const match = await prisma.opportunityMatch.findFirst({
      where: {
        id: matchId,
        savedSearch: { orgId, userId },
      },
    });
    if (!match) throw new NotFoundError("Match not found");

    const now = new Date();
    return prisma.opportunityMatch.update({
      where: { id: matchId },
      data: {
        seenAt: match.seenAt ?? now,
        pursuedAt: now,
      },
    });
  }

  async dismissMatch(matchId: string, orgId: string, userId: string) {
    const match = await prisma.opportunityMatch.findFirst({
      where: {
        id: matchId,
        savedSearch: { orgId, userId },
      },
    });
    if (!match) throw new NotFoundError("Match not found");

    return prisma.opportunityMatch.update({
      where: { id: matchId },
      data: { dismissedAt: new Date() },
    });
  }

  async dismissMatchBulk(
    matchIds: string[],
    orgId: string,
    userId: string,
  ): Promise<BulkMatchUpdateResult> {
    const uniqueIds = dedupeIds(matchIds);

    if (uniqueIds.length === 0) {
      throw new ValidationError("At least one match ID is required");
    }

    if (uniqueIds.length > MAX_BULK_IDS) {
      throw new ValidationError(`Too many matches. Limit is ${MAX_BULK_IDS}.`);
    }

    const matches = await prisma.opportunityMatch.findMany({
      where: {
        id: { in: uniqueIds },
        savedSearch: { orgId, userId },
      },
      select: { id: true },
    });

    const matchedIds = matches.map((match) => match.id);
    if (matchedIds.length === 0) {
      return {
        requested: uniqueIds.length,
        updated: 0,
        skipped: uniqueIds.length,
        ids: [],
      };
    }

    const result = await prisma.opportunityMatch.updateMany({
      where: { id: { in: matchedIds } },
      data: { dismissedAt: new Date() },
    });

    return {
      requested: uniqueIds.length,
      updated: result.count,
      skipped: uniqueIds.length - matchedIds.length,
      ids: matchedIds,
    };
  }

  async deleteMany(
    searchIds: string[],
    orgId: string,
    userId: string,
  ): Promise<BulkSavedSearchResult> {
    const uniqueIds = dedupeIds(searchIds);

    if (uniqueIds.length === 0) {
      throw new ValidationError("At least one saved search ID is required");
    }

    if (uniqueIds.length > MAX_BULK_IDS) {
      throw new ValidationError(`Too many saved searches. Limit is ${MAX_BULK_IDS}.`);
    }

    const existing = await prisma.savedSearch.findMany({
      where: { id: { in: uniqueIds }, orgId, userId },
      select: { id: true },
    });

    const existingIds = existing.map((search) => search.id);
    if (existingIds.length === 0) {
      return {
        requested: uniqueIds.length,
        deleted: 0,
        skipped: uniqueIds.length,
        ids: [],
      };
    }

    await prisma.savedSearch.deleteMany({
      where: { id: { in: existingIds } },
    });

    return {
      requested: uniqueIds.length,
      deleted: existingIds.length,
      skipped: uniqueIds.length - existingIds.length,
      ids: existingIds,
    };
  }

  async runSearches(
    searchIds: string[],
    orgId: string,
    userId: string,
  ): Promise<BulkRunSearchResult> {
    const uniqueIds = dedupeIds(searchIds);

    if (uniqueIds.length === 0) {
      throw new ValidationError("At least one saved search ID is required");
    }

    if (uniqueIds.length > MAX_BULK_IDS) {
      throw new ValidationError(`Too many saved searches. Limit is ${MAX_BULK_IDS}.`);
    }

    const searches = await prisma.savedSearch.findMany({
      where: { id: { in: uniqueIds }, orgId, userId },
      select: { id: true },
    });

    const existingIds = new Set(searches.map((search) => search.id));
    const results: Array<{ savedSearchId: string; newMatches: number; totalMatches: number }> = [];
    const errors: Array<{ savedSearchId: string; message: string }> = [];

    for (const searchId of existingIds) {
      try {
        const runResult = await this.runSearch(searchId, orgId, userId);
        results.push({
          savedSearchId: searchId,
          newMatches: runResult.newMatches,
          totalMatches: runResult.totalMatches,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown failure";
        errors.push({ savedSearchId: searchId, message });
      }
    }

    return {
      requested: uniqueIds.length,
      executed: results.length,
      skipped: uniqueIds.length - results.length - errors.length,
      results,
      errors,
    };
  }

  private async queryPropertyDb(criteria: SearchCriteria): Promise<ParcelResult[]> {
    const allParcels: ParcelResult[] = [];
    const parishes = criteria.parishes ?? [
      "East Baton Rouge",
      "Ascension",
      "Livingston",
      "West Baton Rouge",
      "Iberville",
    ];

    for (const parish of parishes) {
      const searchText = criteria.searchText || "*";

      const result = await propertyDbRpc("api_search_parcels", {
        p_search_text: searchText,
        p_parish: parish,
        p_limit: 50,
      });

      if (Array.isArray(result)) {
        const filtered = (result as ParcelResult[]).filter((parcel) => {
          if (criteria.minAcreage && (parcel.acreage === null || parcel.acreage < criteria.minAcreage)) {
            return false;
          }
          if (criteria.maxAcreage && parcel.acreage !== null && parcel.acreage > criteria.maxAcreage) {
            return false;
          }
          return true;
        });
        allParcels.push(...filtered);
      }
    }

    return allParcels;
  }

  private scoreMatch(parcel: ParcelResult, criteria: SearchCriteria): number {
    let score = 50;

    if (criteria.parishes?.length) {
      const matched = criteria.parishes.some((parish) =>
        parcel.parish_name.toLowerCase().includes(parish.toLowerCase()),
      );
      if (matched) score += 15;
    }

    if (parcel.acreage !== null && criteria.minAcreage && criteria.maxAcreage) {
      const mid = (criteria.minAcreage + criteria.maxAcreage) / 2;
      const range = criteria.maxAcreage - criteria.minAcreage;
      if (range > 0) {
        const distance = Math.abs(parcel.acreage - mid) / range;
        score += Math.max(0, 20 * (1 - distance));
      }
    } else if (parcel.acreage !== null) {
      score += 10;
    }

    if (parcel.lat && parcel.lng) score += 5;
    if (parcel.situs_address && parcel.situs_address.trim().length > 5) score += 10;

    return Math.min(Math.round(score * 100) / 100, 100);
  }

  private buildMatchedCriteria(
    parcel: ParcelResult,
    criteria: SearchCriteria,
  ): Record<string, unknown> {
    const matched: Record<string, unknown> = {};

    if (criteria.parishes?.length) {
      matched.parish = criteria.parishes.some((parish) =>
        parcel.parish_name.toLowerCase().includes(parish.toLowerCase()),
      );
    }

    if (criteria.minAcreage || criteria.maxAcreage) {
      matched.acreageInRange =
        parcel.acreage !== null &&
        (!criteria.minAcreage || parcel.acreage >= criteria.minAcreage) &&
        (!criteria.maxAcreage || parcel.acreage <= criteria.maxAcreage);
    }

    return matched;
  }
}
