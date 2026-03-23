/**
 * Parcel Set Analytics — Pure computation of statistics, distributions, and constraint summaries
 *
 * Transforms a ParcelSetMaterialization into human-readable and machine-processable analytics,
 * including frequency distributions, screening exposure summaries, and constraint identification.
 */

import type {
  ParcelSetMaterialization,
  SetAnalytics,
  ScreeningSummary,
  ScreeningDimension,
} from "@entitlement-os/shared";

/**
 * Compute analytics from a materialized parcel set
 * Pure function — no side effects, no external calls
 *
 * @param materialization The materialized parcel set with facts and screening results
 * @returns SetAnalytics with distributions, exposures, and constraint strings
 */
export function computeAnalytics(
  materialization: ParcelSetMaterialization
): SetAnalytics {
  const { count, facts, screening } = materialization;

  // 1. Total count — directly from materialization
  const totalCount = count;

  // 2. Compute distributions from facts
  const distributions = computeDistributions(facts);

  // 3. Compute screening summary if screening data exists
  const screeningSummary =
    screening && screening.length > 0
      ? computeScreeningSummary(screening, facts.length)
      : null;

  // 4. Generate top constraints
  const topConstraints = generateTopConstraints(
    distributions,
    screeningSummary,
    facts.length
  );

  // 5. Scoring summary — null for now (Phase 3)
  const scoringSummary = null;

  return {
    totalCount,
    distributions,
    screeningSummary,
    topConstraints,
    scoringSummary,
  };
}

/**
 * Compute frequency distributions for each field
 * Only includes fields with non-null values
 *
 * @param facts Array of parcel facts
 * @returns Record mapping field names to value frequency maps
 */
function computeDistributions(
  facts: ParcelSetMaterialization["facts"]
): Record<string, Record<string, number>> {
  const distributions: Record<string, Record<string, number>> = {};

  if (facts.length === 0) {
    return distributions;
  }

  // Define fields to track distributions for
  const fieldsToTrack = ["zoningType", "parish"] as const;

  fieldsToTrack.forEach((field) => {
    distributions[field] = {};

    facts.forEach((fact) => {
      const value = fact[field as keyof typeof fact];
      if (value !== null && value !== undefined) {
        const key = String(value);
        distributions[field][key] = (distributions[field][key] || 0) + 1;
      }
    });

    // Remove field if no values were found
    if (Object.keys(distributions[field]).length === 0) {
      delete distributions[field];
    }
  });

  return distributions;
}

/**
 * Compute screening exposure summary
 * Analyzes screening results to extract flood, wetland, and EPA exposure metrics
 *
 * @param screening Array of screening results
 * @param totalFactsCount Total number of parcel facts (for percentages)
 * @returns ScreeningSummary or null if no screening data
 */
function computeScreeningSummary(
  screening: ParcelSetMaterialization["screening"],
  totalFactsCount: number
): ScreeningSummary | null {
  if (screening.length === 0) {
    return null;
  }

  // Collect unique dimensions
  const dimensionSet = new Set<ScreeningDimension>();
  screening.forEach((result) => {
    result.dimensions.forEach((dim) => dimensionSet.add(dim));
  });

  const dimensionsScreened = Array.from(dimensionSet);

  // Analyze flood exposure
  let floodExposure: { sfhaCount: number; totalCount: number } | null = null;
  const floodScreening = screening.filter((r) =>
    r.dimensions.includes("flood")
  );
  if (floodScreening.length > 0) {
    const sfhaCount = floodScreening.filter(
      (r) => r.envelope.in_sfha === true
    ).length;
    floodExposure = {
      sfhaCount,
      totalCount: floodScreening.length,
    };
  }

  // Analyze wetland exposure
  let wetlandExposure: { affectedCount: number; totalCount: number } | null =
    null;
  const wetlandScreening = screening.filter((r) =>
    r.dimensions.includes("wetlands")
  );
  if (wetlandScreening.length > 0) {
    const affectedCount = wetlandScreening.filter(
      (r) => r.envelope.has_wetlands === true
    ).length;
    wetlandExposure = {
      affectedCount,
      totalCount: wetlandScreening.length,
    };
  }

  // Analyze EPA proximity
  let epaProximity: { sitesWithinMile: number } | null = null;
  const epaScreening = screening.filter((r) => r.dimensions.includes("epa"));
  if (epaScreening.length > 0) {
    const sitesSet = new Set<string>();
    epaScreening.forEach((r) => {
      const siteCount = r.envelope.site_count;
      if (typeof siteCount === "number" && siteCount > 0) {
        // Count unique sites across all EPA results
        const sites = r.envelope.sites;
        if (Array.isArray(sites)) {
          sites.forEach((site: unknown) => {
            const siteId = typeof site === "object" && site !== null
              ? (site as Record<string, unknown>).id
              : String(site);
            if (siteId) sitesSet.add(String(siteId));
          });
        } else if (typeof siteCount === "number") {
          // If no sites array, use site_count as upper bound
          for (let i = 0; i < siteCount; i++) {
            sitesSet.add(`epa_${r.parcelId}_${i}`);
          }
        }
      }
    });
    if (sitesSet.size > 0) {
      epaProximity = {
        sitesWithinMile: sitesSet.size,
      };
    }
  }

  return {
    dimensionsScreened,
    floodExposure,
    wetlandExposure,
    epaProximity,
  };
}

/**
 * Generate human-readable constraint strings from analytics
 * Identifies and prioritizes material constraints
 *
 * @param distributions Field frequency distributions
 * @param screeningSummary Screening exposure summary
 * @param totalCount Total number of parcels
 * @returns Array of constraint strings
 */
function generateTopConstraints(
  distributions: Record<string, Record<string, number>>,
  screeningSummary: ScreeningSummary | null,
  totalCount: number
): string[] {
  const constraints: string[] = [];

  if (totalCount === 0) {
    return constraints;
  }

  // Flood constraint
  if (screeningSummary?.floodExposure) {
    const { sfhaCount, totalCount: floodTotal } =
      screeningSummary.floodExposure;
    if (sfhaCount > 0) {
      const pct = Math.round((sfhaCount / floodTotal) * 100);
      constraints.push(`${pct}% in SFHA flood zone`);
    }
  }

  // Wetland constraint
  if (screeningSummary?.wetlandExposure) {
    const { affectedCount } = screeningSummary.wetlandExposure;
    if (affectedCount > 0) {
      const verb = affectedCount > 1 ? "have" : "has";
      const parcelWord = affectedCount > 1 ? "parcels" : "parcel";
      constraints.push(`${affectedCount} ${parcelWord} ${verb} wetland exposure`);
    }
  }

  // EPA constraint
  if (screeningSummary?.epaProximity) {
    const { sitesWithinMile } = screeningSummary.epaProximity;
    if (sitesWithinMile > 0) {
      const facilityWord = sitesWithinMile > 1 ? "facilities" : "facility";
      constraints.push(`${sitesWithinMile} parcel${sitesWithinMile > 1 ? "s" : ""} near EPA-listed ${facilityWord}`);
    }
  }

  // Zoning constraint (dominant type >60%)
  if (distributions.zoningType) {
    const zoningCounts = distributions.zoningType;
    for (const [zoneType, count] of Object.entries(zoningCounts)) {
      const pct = Math.round((count / totalCount) * 100);
      if (pct > 60) {
        constraints.push(`${pct}% zoned ${zoneType}`);
        break; // Only include the most dominant zone
      }
    }
  }

  return constraints;
}
