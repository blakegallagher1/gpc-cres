import { prisma } from "@entitlement-os/db";
import type { Prisma } from "@entitlement-os/db";
import { NotFoundError, ValidationError } from "@/lib/errors";

function requirePropertyDbEnv(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`[saved-search-service] Missing required ${name}.`);
  }
  return normalized;
}

function getPropertyDbConfig(): { url: string; key: string } {
  return {
    url: requirePropertyDbEnv(
      process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
      "SUPABASE_URL",
    ),
    key: requirePropertyDbEnv(
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      "SUPABASE_SERVICE_ROLE_KEY",
    ),
  };
}

async function propertyDbRpc(fnName: string, body: Record<string, unknown>): Promise<unknown> {
  const { url, key } = getPropertyDbConfig();
  const res = await fetch(`${url}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Property DB error (${res.status}): ${text}`);
  }
  return res.json();
}

export interface SearchCriteria {
  parishes?: string[];
  zoningCodes?: string[];
  minAcreage?: number;
  maxAcreage?: number;
  propertyTypes?: string[]; // SKU types the user is interested in
  searchText?: string; // Address/owner keyword
  /** GeoJSON polygon geometry for prospecting area searches */
  polygon?: {
    type: "Polygon";
    coordinates: number[][][];
  };
  /** Exclude parcels in high-risk flood zones (A, AE, V) */
  excludeFloodZone?: boolean;
  /** Minimum assessed value */
  minAssessedValue?: number;
  /** Maximum assessed value */
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
    // Verify ownership
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

  /**
   * Execute a saved search against the Louisiana Property DB.
   * Returns new matches (parcels not already matched).
   */
  async runSearch(id: string, orgId: string, userId: string) {
    const search = await prisma.savedSearch.findFirst({
      where: { id, orgId, userId },
      include: { matches: { select: { parcelId: true } } },
    });
    if (!search) throw new NotFoundError("Saved search not found");

    const criteria = search.criteria as unknown as SearchCriteria;
    const existingParcelIds = new Set(search.matches.map((m) => m.parcelId));

    // Query property DB for matching parcels
    const parcels = await this.queryPropertyDb(criteria);

    // Filter to only new matches
    const newParcels = parcels.filter((p) => !existingParcelIds.has(p.id));

    if (newParcels.length === 0) {
      await prisma.savedSearch.update({
        where: { id },
        data: { lastRunAt: new Date() },
      });
      return { newMatches: 0, totalMatches: search.matches.length };
    }

    // Score and create match records
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

  /**
   * Get unseen opportunity matches across all saved searches for a user.
   */
  async getOpportunities(orgId: string, userId: string, limit = 20, offset = 0) {
    const searches = await prisma.savedSearch.findMany({
      where: { orgId, userId },
      select: { id: true },
    });
    const searchIds = searches.map((s) => s.id);

    if (searchIds.length === 0) {
      return { opportunities: [], total: 0 };
    }

    const [opportunities, total] = await Promise.all([
      prisma.opportunityMatch.findMany({
        where: {
          savedSearchId: { in: searchIds },
          dismissedAt: null,
        },
        include: {
          savedSearch: { select: { id: true, name: true } },
        },
        orderBy: [{ seenAt: { sort: "asc", nulls: "first" } }, { matchScore: "desc" }],
        take: limit,
        skip: offset,
      }),
      prisma.opportunityMatch.count({
        where: {
          savedSearchId: { in: searchIds },
          dismissedAt: null,
        },
      }),
    ]);

    return { opportunities, total };
  }

  async markSeenBulk(matchIds: string[], orgId: string, userId: string): Promise<BulkMatchUpdateResult> {
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
    userId: string
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

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  async deleteMany(
    searchIds: string[],
    orgId: string,
    userId: string
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
    userId: string
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
        const filtered = (result as ParcelResult[]).filter((p) => {
          // Apply acreage filter
          if (criteria.minAcreage && (p.acreage === null || p.acreage < criteria.minAcreage)) {
            return false;
          }
          if (criteria.maxAcreage && p.acreage !== null && p.acreage > criteria.maxAcreage) {
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
    let score = 50; // Base score

    // Parish match bonus
    if (criteria.parishes?.length) {
      const match = criteria.parishes.some(
        (p) => parcel.parish_name.toLowerCase().includes(p.toLowerCase())
      );
      if (match) score += 15;
    }

    // Acreage fit bonus
    if (parcel.acreage !== null && criteria.minAcreage && criteria.maxAcreage) {
      const mid = (criteria.minAcreage + criteria.maxAcreage) / 2;
      const range = criteria.maxAcreage - criteria.minAcreage;
      if (range > 0) {
        const dist = Math.abs(parcel.acreage - mid) / range;
        score += Math.max(0, 20 * (1 - dist));
      }
    } else if (parcel.acreage !== null) {
      score += 10; // Has acreage data
    }

    // Has coordinates bonus (means geocoded/real parcel)
    if (parcel.lat && parcel.lng) score += 5;

    // Has address bonus
    if (parcel.situs_address && parcel.situs_address.trim().length > 5) score += 10;

    return Math.min(Math.round(score * 100) / 100, 100);
  }

  private buildMatchedCriteria(
    parcel: ParcelResult,
    criteria: SearchCriteria
  ): Record<string, unknown> {
    const matched: Record<string, unknown> = {};

    if (criteria.parishes?.length) {
      matched.parish = criteria.parishes.some(
        (p) => parcel.parish_name.toLowerCase().includes(p.toLowerCase())
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
