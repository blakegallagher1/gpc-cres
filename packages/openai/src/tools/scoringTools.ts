import { tool } from "@openai/agents";
import { z } from "zod";

export const parcelTriageScore = tool({
  name: "parcel_triage_score",
  description:
    "Run triage scoring on a parcel to determine KILL/HOLD/ADVANCE decision. Analyzes zoning compatibility, acreage, location, and known risk factors.",
  parameters: z.object({
    dealId: z.string().uuid().describe("The deal this parcel belongs to"),
    address: z.string().min(1).describe("Parcel address"),
    currentZoning: z
      .string()
      .nullable()
      .describe("Current zoning code (e.g. M1, C2, A1)"),
    acreage: z.number().nullable().describe("Parcel acreage"),
    proposedUse: z
      .enum(["SMALL_BAY_FLEX", "OUTDOOR_STORAGE", "TRUCK_PARKING"])
      .describe("The proposed SKU/use type"),
    floodZone: z
      .string()
      .nullable()
      .describe("FEMA flood zone code if known (e.g. X, AE, A)"),
    futureLandUse: z
      .string()
      .nullable()
      .describe("Future land use designation if known"),
    utilitiesAvailable: z
      .boolean()
      .nullable()
      .describe("Whether utilities (water, sewer, electric) are available"),
    frontageRoad: z
      .string()
      .nullable()
      .describe("Name or classification of frontage road"),
    adjacentUses: z
      .string()
      .nullable()
      .describe("Description of adjacent land uses"),
  }),
  execute: async ({
    dealId,
    address,
    currentZoning,
    acreage,
    proposedUse,
    floodZone,
    futureLandUse,
    utilitiesAvailable,
    frontageRoad,
    adjacentUses,
  }) => {
    const disqualifiers: Array<{ label: string; detail: string; severity: "hard" | "soft" }> = [];
    const dataGaps: string[] = [];

    // --- Zoning scoring (25%) ---
    function scoreZoning(): { score: number; detail: string } {
      if (!currentZoning) {
        dataGaps.push("currentZoning not provided");
        return { score: 50, detail: "Zoning unknown — needs investigation" };
      }
      const code = currentZoning.toUpperCase().trim();
      const industrial = ["M1", "M2", "I1", "I2", "LI", "HI"];
      const heavyCommercial = ["C2", "C3", "HC"];
      const agricultural = ["A1", "A2", "A3", "A4", "A5"];

      if (industrial.some((z) => code.startsWith(z))) {
        return { score: 95, detail: `${code} — compatible industrial zone` };
      }
      if (heavyCommercial.some((z) => code.startsWith(z))) {
        disqualifiers.push({
          label: "CUP likely required",
          detail: `Zone ${code} likely requires a Conditional Use Permit for ${proposedUse}`,
          severity: "soft",
        });
        return { score: 65, detail: `${code} — heavy commercial, CUP likely needed` };
      }
      if (agricultural.some((z) => code.startsWith(z)) || code === "A") {
        disqualifiers.push({
          label: "Rezoning required",
          detail: `Zone ${code} requires rezoning for ${proposedUse}, but possible in rural Louisiana`,
          severity: "soft",
        });
        return { score: 35, detail: `${code} — agricultural, rezoning possible in rural LA` };
      }
      if (code.startsWith("RU") || code === "RU") {
        disqualifiers.push({
          label: "Rezoning required",
          detail: `Rural zone ${code} requires rezoning for ${proposedUse}`,
          severity: "soft",
        });
        return { score: 40, detail: `${code} — rural residential, rezoning possible with effort` };
      }
      if (code.startsWith("R")) {
        disqualifiers.push({
          label: "Residential zoning — extremely difficult rezoning",
          detail: `Zone ${code} is residential; rezoning to industrial is politically sensitive and rarely approved`,
          severity: "hard",
        });
        return { score: 15, detail: `${code} — residential, very difficult rezoning` };
      }
      return { score: 50, detail: `${code} — unrecognized zone, needs manual review` };
    }

    // --- Flood scoring (20%) ---
    function scoreFlood(): { score: number; detail: string } {
      if (!floodZone) {
        dataGaps.push("floodZone not provided");
        return { score: 50, detail: "Flood zone unknown — needs investigation" };
      }
      const fz = floodZone.toUpperCase().trim();
      if (fz === "X" || fz === "C") {
        return { score: 100, detail: `Zone ${fz} — minimal flood risk` };
      }
      if (fz === "X500" || fz === "B" || fz.includes("SHADED")) {
        return { score: 70, detail: `Zone ${fz} — moderate flood risk (500-year)` };
      }
      if (fz === "AE") {
        disqualifiers.push({
          label: "High-risk flood zone",
          detail: `FEMA Zone AE — high flood risk with base flood elevation data`,
          severity: "hard",
        });
        return { score: 30, detail: `Zone AE — high flood risk, BFE data available` };
      }
      const severeZones = ["A", "AH", "AO", "V", "VE"];
      if (severeZones.includes(fz)) {
        disqualifiers.push({
          label: "High-risk flood zone",
          detail: `FEMA Zone ${fz} — severe flood risk, significant insurance cost and development constraints`,
          severity: "hard",
        });
        return { score: 10, detail: `Zone ${fz} — severe flood risk` };
      }
      return { score: 50, detail: `Zone ${fz} — unrecognized flood zone, needs manual review` };
    }

    // --- Acreage scoring (15%) ---
    function scoreAcreage(): { score: number; detail: string } {
      if (acreage === null || acreage === undefined) {
        dataGaps.push("acreage not provided");
        return { score: 50, detail: "Acreage unknown — needs investigation" };
      }
      const idealRanges: Record<string, { min: number; idealLow: number; idealHigh: number }> = {
        SMALL_BAY_FLEX: { min: 1, idealLow: 3, idealHigh: 10 },
        OUTDOOR_STORAGE: { min: 2, idealLow: 5, idealHigh: 20 },
        TRUCK_PARKING: { min: 3, idealLow: 8, idealHigh: 30 },
      };
      const range = idealRanges[proposedUse];
      if (!range) {
        return { score: 50, detail: `${acreage} acres — unknown SKU type` };
      }

      if (acreage < range.min) {
        disqualifiers.push({
          label: "Undersized parcel",
          detail: `${acreage} acres is below the ${range.min}-acre absolute minimum for ${proposedUse}`,
          severity: "hard",
        });
        return { score: 10, detail: `${acreage} ac — below ${range.min} ac minimum for ${proposedUse}` };
      }
      if (acreage < range.idealLow) {
        return { score: 55, detail: `${acreage} ac — below ideal (${range.idealLow}-${range.idealHigh} ac) but above minimum` };
      }
      if (acreage <= range.idealHigh) {
        return { score: 95, detail: `${acreage} ac — within ideal range for ${proposedUse}` };
      }
      if (acreage <= range.idealHigh * 2) {
        return { score: 85, detail: `${acreage} ac — above ideal range but workable` };
      }
      return { score: 70, detail: `${acreage} ac — oversized (>${range.idealHigh * 2} ac) but workable` };
    }

    // --- Location scoring (15%) ---
    function scoreLocation(): { score: number; detail: string } {
      let locationScore = 50;
      let detail = "Location data unknown";

      if (frontageRoad) {
        const road = frontageRoad.toUpperCase();
        if (/\b(I-\d|INTERSTATE|HWY|HIGHWAY|US[\s-]?\d|US ROUTE)\b/.test(road)) {
          locationScore = 90;
          detail = `${frontageRoad} — highway/interstate frontage`;
        } else if (/\b(STATE|SR[\s-]?\d|LA[\s-]?\d)\b/.test(road)) {
          locationScore = 90;
          detail = `${frontageRoad} — state highway frontage`;
        } else if (/\b(BLVD|AVE|PKWY|BOULEVARD|AVENUE|PARKWAY)\b/.test(road) || /\b[4-9]\s*LANE\b/.test(road)) {
          locationScore = 75;
          detail = `${frontageRoad} — arterial road`;
        } else {
          locationScore = 60;
          detail = `${frontageRoad} — road classification unclear`;
        }
      } else {
        dataGaps.push("frontageRoad not provided");
      }

      if (adjacentUses) {
        const adj = adjacentUses.toLowerCase();
        if (/\b(industrial|warehouse|distribution|manufacturing|storage)\b/.test(adj)) {
          locationScore = Math.min(100, locationScore + 10);
          detail += "; industrial adjacency (+10)";
        }
        if (/\b(residential|school|church|daycare|hospital)\b/.test(adj)) {
          locationScore = Math.max(0, locationScore - 10);
          detail += "; sensitive adjacency (-10)";
          disqualifiers.push({
            label: "Sensitive adjacent uses",
            detail: `Adjacent uses include sensitive receptors: ${adjacentUses}`,
            severity: "soft",
          });
        }
      } else {
        dataGaps.push("adjacentUses not provided");
      }

      return { score: locationScore, detail };
    }

    // --- Utilities scoring (10%) ---
    function scoreUtilities(): { score: number; detail: string } {
      if (utilitiesAvailable === null || utilitiesAvailable === undefined) {
        dataGaps.push("utilitiesAvailable not provided");
        return { score: 50, detail: "Utilities availability unknown" };
      }
      if (utilitiesAvailable) {
        return { score: 95, detail: "All utilities available" };
      }
      disqualifiers.push({
        label: "No utilities",
        detail: "Utilities not available — significant infrastructure cost to extend",
        severity: "soft",
      });
      return { score: 15, detail: "Utilities not available — infrastructure cost required" };
    }

    // --- Future Land Use scoring (15%) ---
    function scoreFutureLandUse(): { score: number; detail: string } {
      if (!futureLandUse) {
        dataGaps.push("futureLandUse not provided");
        return { score: 50, detail: "Future land use unknown — needs investigation" };
      }
      const flu = futureLandUse.toLowerCase();
      if (/\b(industrial|manufacturing|warehouse|distribution|logistics)\b/.test(flu)) {
        return { score: 95, detail: `FLU: ${futureLandUse} — aligned with industrial use` };
      }
      if (/\b(commercial|business|mixed)\b/.test(flu)) {
        return { score: 70, detail: `FLU: ${futureLandUse} — commercial/mixed, compatible` };
      }
      if (/\b(agricultural|rural|farm)\b/.test(flu)) {
        return { score: 45, detail: `FLU: ${futureLandUse} — agricultural, may transition` };
      }
      if (/\b(residential|conservation|open\s*space|park|recreation)\b/.test(flu)) {
        return { score: 15, detail: `FLU: ${futureLandUse} — not aligned with industrial use` };
      }
      return { score: 50, detail: `FLU: ${futureLandUse} — unrecognized designation` };
    }

    // --- Calculate all category scores ---
    const zoning = scoreZoning();
    const flood = scoreFlood();
    const acreageResult = scoreAcreage();
    const location = scoreLocation();
    const utilities = scoreUtilities();
    const fluResult = scoreFutureLandUse();

    const weights = {
      zoning: 0.25,
      flood: 0.20,
      acreage: 0.15,
      location: 0.15,
      utilities: 0.10,
      futureLandUse: 0.15,
    };

    const categoryScores = {
      zoning: { score: zoning.score, weight: weights.zoning, weighted: Math.round(zoning.score * weights.zoning * 10) / 10, detail: zoning.detail },
      flood: { score: flood.score, weight: weights.flood, weighted: Math.round(flood.score * weights.flood * 10) / 10, detail: flood.detail },
      acreage: { score: acreageResult.score, weight: weights.acreage, weighted: Math.round(acreageResult.score * weights.acreage * 10) / 10, detail: acreageResult.detail },
      location: { score: location.score, weight: weights.location, weighted: Math.round(location.score * weights.location * 10) / 10, detail: location.detail },
      utilities: { score: utilities.score, weight: weights.utilities, weighted: Math.round(utilities.score * weights.utilities * 10) / 10, detail: utilities.detail },
      futureLandUse: { score: fluResult.score, weight: weights.futureLandUse, weighted: Math.round(fluResult.score * weights.futureLandUse * 10) / 10, detail: fluResult.detail },
    };

    const totalScore = Math.round(
      categoryScores.zoning.weighted +
      categoryScores.flood.weighted +
      categoryScores.acreage.weighted +
      categoryScores.location.weighted +
      categoryScores.utilities.weighted +
      categoryScores.futureLandUse.weighted
    );

    const score = Math.max(0, Math.min(100, totalScore));

    // --- Determine decision ---
    const hardDisqualifiers = disqualifiers.filter((d) => d.severity === "hard");
    let decision: "KILL" | "HOLD" | "ADVANCE";
    let tier: string;

    if (hardDisqualifiers.length > 0) {
      decision = "KILL";
      tier = "F";
    } else if (score >= 70) {
      decision = "ADVANCE";
      tier = score >= 85 ? "A" : "B";
    } else if (score >= 40) {
      decision = "HOLD";
      tier = score >= 55 ? "C" : "D";
    } else {
      decision = "KILL";
      tier = "F";
    }

    return JSON.stringify({
      dealId,
      address,
      decision,
      score,
      tier,
      categoryScores,
      disqualifiers,
      dataGaps,
    });
  },
});

export const hardFilterCheck = tool({
  name: "hard_filter_check",
  description:
    "Check if a parcel hits any auto-KILL conditions (flood zone, wetlands, restricted zoning, undersized, etc.)",
  parameters: z.object({
    address: z.string().min(1).describe("Parcel address"),
    currentZoning: z
      .string()
      .nullable()
      .describe("Current zoning code"),
    acreage: z.number().nullable().describe("Parcel acreage"),
    proposedUse: z
      .enum(["SMALL_BAY_FLEX", "OUTDOOR_STORAGE", "TRUCK_PARKING"])
      .describe("Proposed use type"),
    floodZone: z
      .string()
      .nullable()
      .describe("FEMA flood zone code"),
    isWetland: z
      .boolean()
      .nullable()
      .describe("Whether the parcel contains wetlands"),
    isContaminated: z
      .boolean()
      .nullable()
      .describe("Whether the parcel has known environmental contamination"),
  }),
  execute: async ({
    address,
    currentZoning,
    acreage,
    proposedUse,
    floodZone,
    isWetland,
    isContaminated,
  }) => {
    const disqualifiers: string[] = [];

    // Flood zone check
    if (floodZone) {
      const highRiskZones = ["A", "AE", "AH", "AO", "V", "VE"];
      if (highRiskZones.includes(floodZone.toUpperCase())) {
        disqualifiers.push(
          `High-risk FEMA flood zone (${floodZone}): uninsurable or extremely expensive`,
        );
      }
    }

    // Wetland check
    if (isWetland === true) {
      disqualifiers.push("Parcel contains wetlands: USACE 404 permit required, likely infeasible");
    }

    // Contamination
    if (isContaminated === true) {
      disqualifiers.push(
        "Known environmental contamination: Phase II ESA required, remediation cost unknown",
      );
    }

    // Residential zoning
    if (currentZoning) {
      const code = currentZoning.toUpperCase().trim();
      if (code.startsWith("R") && !code.startsWith("RU")) {
        disqualifiers.push(
          `Residential zoning (${code}): rezoning to industrial is extremely difficult and politically sensitive`,
        );
      }
    }

    // Size check
    if (acreage !== undefined) {
      const absoluteMin: Record<string, number> = {
        SMALL_BAY_FLEX: 1,
        OUTDOOR_STORAGE: 2,
        TRUCK_PARKING: 3,
      };
      const min = absoluteMin[proposedUse] ?? 1;
      if (acreage !== null && acreage < min) {
        disqualifiers.push(
          `Parcel too small (${acreage} ac) for ${proposedUse} (minimum ${min} ac)`,
        );
      }
    }

    return JSON.stringify({
      address,
      passed: disqualifiers.length === 0,
      disqualifiers,
    });
  },
});
