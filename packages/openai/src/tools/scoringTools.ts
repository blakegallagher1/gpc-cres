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
    // TODO: Wire up packages/shared scoring engine when complete.
    // For now, run a basic heuristic analysis.

    const disqualifiers: Array<{ label: string; detail: string; severity: "hard" | "soft" }> = [];
    let score = 50; // start neutral

    // Hard filter: flood zone
    if (floodZone) {
      const highRiskZones = ["A", "AE", "AH", "AO", "V", "VE"];
      if (highRiskZones.includes(floodZone.toUpperCase())) {
        disqualifiers.push({
          label: "High-risk flood zone",
          detail: `Parcel is in FEMA flood zone ${floodZone} - significant flood insurance cost and development risk`,
          severity: "hard",
        });
        score -= 30;
      }
    }

    // Zoning compatibility
    if (currentZoning) {
      const code = currentZoning.toUpperCase().trim();
      const industrialZones = ["M1", "M2", "I1", "I2", "LI", "HI"];
      const commercialZones = ["C2", "C3", "HC"];

      if (industrialZones.some((z) => code.startsWith(z))) {
        score += 20; // Compatible zoning
      } else if (commercialZones.some((z) => code.startsWith(z))) {
        score += 5; // May need CUP
        disqualifiers.push({
          label: "CUP likely required",
          detail: `Zone ${code} likely requires a Conditional Use Permit for ${proposedUse}`,
          severity: "soft",
        });
      } else if (code.startsWith("A") || code.startsWith("R")) {
        score -= 20;
        disqualifiers.push({
          label: "Rezoning required",
          detail: `Zone ${code} is not compatible with ${proposedUse}. Full rezoning would be needed.`,
          severity: "hard",
        });
      }
    }

    // Acreage check
    if (acreage !== undefined) {
      const minAcreage: Record<string, number> = {
        SMALL_BAY_FLEX: 2,
        OUTDOOR_STORAGE: 3,
        TRUCK_PARKING: 5,
      };
      const min = minAcreage[proposedUse] ?? 2;
      if (acreage !== null && acreage < min) {
        disqualifiers.push({
          label: "Undersized parcel",
          detail: `${acreage} acres is below the ${min}-acre minimum for ${proposedUse}`,
          severity: "soft",
        });
        score -= 10;
      } else {
        score += 10;
      }
    }

    // Utilities
    if (utilitiesAvailable === false) {
      disqualifiers.push({
        label: "No utilities",
        detail: "Utilities not available - significant infrastructure cost",
        severity: "soft",
      });
      score -= 10;
    } else if (utilitiesAvailable === true) {
      score += 5;
    }

    // Determine decision
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

    // Clamp score to 0-100
    score = Math.max(0, Math.min(100, score));

    return JSON.stringify({
      dealId,
      address,
      decision,
      score,
      tier,
      breakdown: {
        zoningCompatibility: currentZoning ?? "unknown",
        acreage: acreage ?? "unknown",
        floodZone: floodZone ?? "unknown",
        utilities: utilitiesAvailable ?? "unknown",
        frontageRoad: frontageRoad ?? "unknown",
        adjacentUses: adjacentUses ?? "unknown",
        futureLandUse: futureLandUse ?? "unknown",
      },
      disqualifiers,
      _stub: true,
      _note:
        "Scoring is a basic heuristic. Full scoring engine (packages/shared) will provide calibrated risk scores.",
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
