import { prisma } from "@entitlement-os/db";
import type { Prisma } from "@entitlement-os/db";
import { getNotificationService } from "@/lib/services/notification.service";

function requirePropertyDbEnv(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`[opportunity-scanner-job] Missing required ${name}.`);
  }
  return normalized;
}

export interface JobResult {
  success: boolean;
  processed: number;
  newMatches: number;
  errors: string[];
  duration_ms: number;
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

interface SearchCriteria {
  parishes?: string[];
  zoningCodes?: string[];
  minAcreage?: number;
  maxAcreage?: number;
  propertyTypes?: string[];
  searchText?: string;
}

async function propertyDbRpc(
  fnName: string,
  body: Record<string, unknown>
): Promise<unknown> {
  const propertyDbUrl = requirePropertyDbEnv(
    process.env.LA_PROPERTY_DB_URL,
    "LA_PROPERTY_DB_URL",
  );
  const propertyDbKey = requirePropertyDbEnv(
    process.env.LA_PROPERTY_DB_KEY,
    "LA_PROPERTY_DB_KEY",
  );
  const res = await fetch(`${propertyDbUrl}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: {
      apikey: propertyDbKey,
      Authorization: `Bearer ${propertyDbKey}`,
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

/**
 * OpportunityScannerJob — runs every 6 hours via Vercel Cron.
 *
 * 1. Load all active saved searches where alertEnabled = true
 * 2. For each, query the property DB against the criteria
 * 3. Diff against previous matches to find NEW matches only
 * 4. Score matches
 * 5. Create opportunity_matches records
 * 6. Create notifications for new matches
 */
export class OpportunityScannerJob {
  async execute(): Promise<JobResult> {
    const start = Date.now();
    const errors: string[] = [];
    let processed = 0;
    let totalNewMatches = 0;

    try {
      // Load all saved searches with alerts enabled
      const searches = await prisma.savedSearch.findMany({
        where: { alertEnabled: true },
        include: {
          matches: { select: { parcelId: true } },
          user: { select: { id: true } },
        },
      });

      for (const search of searches) {
        try {
          const criteria = search.criteria as unknown as SearchCriteria;
          const existingParcelIds = new Set(
            search.matches.map((m) => m.parcelId)
          );

          // Query property DB
          const parcels = await this.queryPropertyDb(criteria);
          const newParcels = parcels.filter(
            (p) => !existingParcelIds.has(p.id)
          );

          if (newParcels.length > 0) {
            const matchData = newParcels.map((parcel) => ({
              savedSearchId: search.id,
              parcelId: parcel.id,
              matchScore: this.scoreMatch(parcel, criteria),
              matchedCriteria: this.buildMatchedCriteria(
                parcel,
                criteria
              ) as Prisma.InputJsonValue,
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

            totalNewMatches += newParcels.length;

            // Update match count
            const totalMatches =
              search.matches.length + newParcels.length;
            await prisma.savedSearch.update({
              where: { id: search.id },
              data: {
                lastRunAt: new Date(),
                matchCount: totalMatches,
              },
            });

            // Create notification for user
            if (newParcels.length > 0) {
              try {
                const notificationService = getNotificationService();
                await notificationService.create({
                  orgId: search.orgId,
                  userId: search.userId,
                  type: "OPPORTUNITY",
                  title: `${newParcels.length} new match${newParcels.length > 1 ? "es" : ""} for "${search.name}"`,
                  body: `Found ${newParcels.length} new parcel${newParcels.length > 1 ? "s" : ""} matching your saved search criteria.`,
                  priority: "MEDIUM",
                  actionUrl: "/command-center",
                  sourceAgent: "opportunity-scanner",
                  metadata: {
                    savedSearchId: search.id,
                    newMatchCount: newParcels.length,
                  },
                });
              } catch (notifErr) {
                // Never let notification failure break the job
                console.error(
                  "[opportunity-scanner] notification error:",
                  notifErr instanceof Error
                    ? notifErr.message
                    : String(notifErr)
                );
              }
            }
          } else {
            await prisma.savedSearch.update({
              where: { id: search.id },
              data: { lastRunAt: new Date() },
            });
          }

          processed++;
        } catch (searchErr) {
          const msg = `Search "${search.name}" (${search.id}): ${searchErr instanceof Error ? searchErr.message : String(searchErr)}`;
          errors.push(msg);
          console.error("[opportunity-scanner]", msg);
        }
      }
    } catch (err) {
      errors.push(
        err instanceof Error ? err.message : String(err)
      );
    }

    return {
      success: errors.length === 0,
      processed,
      newMatches: totalNewMatches,
      errors,
      duration_ms: Date.now() - start,
    };
  }

  private async queryPropertyDb(
    criteria: SearchCriteria
  ): Promise<ParcelResult[]> {
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

      try {
        const result = await propertyDbRpc("api_search_parcels", {
          p_search_text: searchText,
          p_parish: parish,
          p_limit: 50,
        });

        if (Array.isArray(result)) {
          const filtered = (result as ParcelResult[]).filter((p) => {
            if (
              criteria.minAcreage &&
              (p.acreage === null || p.acreage < criteria.minAcreage)
            ) {
              return false;
            }
            if (
              criteria.maxAcreage &&
              p.acreage !== null &&
              p.acreage > criteria.maxAcreage
            ) {
              return false;
            }
            return true;
          });
          allParcels.push(...filtered);
        }
      } catch (err) {
        console.error(
          `[opportunity-scanner] parish query failed for ${parish}:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    return allParcels;
  }

  private scoreMatch(
    parcel: ParcelResult,
    criteria: SearchCriteria
  ): number {
    let score = 50;

    if (criteria.parishes?.length) {
      const match = criteria.parishes.some((p) =>
        parcel.parish_name.toLowerCase().includes(p.toLowerCase())
      );
      if (match) score += 15;
    }

    if (
      parcel.acreage !== null &&
      criteria.minAcreage &&
      criteria.maxAcreage
    ) {
      const mid = (criteria.minAcreage + criteria.maxAcreage) / 2;
      const range = criteria.maxAcreage - criteria.minAcreage;
      if (range > 0) {
        const dist = Math.abs(parcel.acreage - mid) / range;
        score += Math.max(0, 20 * (1 - dist));
      }
    } else if (parcel.acreage !== null) {
      score += 10;
    }

    if (parcel.lat && parcel.lng) score += 5;
    if (parcel.situs_address && parcel.situs_address.trim().length > 5)
      score += 10;

    return Math.min(Math.round(score * 100) / 100, 100);
  }

  private buildMatchedCriteria(
    parcel: ParcelResult,
    criteria: SearchCriteria
  ): Record<string, unknown> {
    const matched: Record<string, unknown> = {};

    if (criteria.parishes?.length) {
      matched.parish = criteria.parishes.some((p) =>
        parcel.parish_name.toLowerCase().includes(p.toLowerCase())
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
