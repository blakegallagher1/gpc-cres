import { prisma } from "@entitlement-os/db";
import type { Prisma } from "@entitlement-os/db";
import { NotFoundError } from "@/lib/errors";

const PROPERTY_DB_URL =
  process.env.LA_PROPERTY_DB_URL ?? "https://jueyosscalcljgdorrpy.supabase.co";
const PROPERTY_DB_KEY = process.env.LA_PROPERTY_DB_KEY ?? "";

async function propertyDbRpc(fnName: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${PROPERTY_DB_URL}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: {
      apikey: PROPERTY_DB_KEY,
      Authorization: `Bearer ${PROPERTY_DB_KEY}`,
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

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

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
