import { describe, expect, it } from "vitest";

import { computeTriageScore } from "../src/scoring/triage.js";
import { hardFilterCheck } from "../src/scoring/hardFilters.js";

describe("computeTriageScore", () => {
  it("returns ADVANCE for high scores", () => {
    const result = computeTriageScore({
      accessScore: 90,
      drainageScore: 85,
      adjacencyScore: 80,
      environmentalScore: 95,
      utilitiesScore: 90,
      politicsScore: 75,
      zoningScore: 85,
      acreageScore: 80,
    });
    expect(result.decision).toBe("ADVANCE");
    expect(result.tier).toBe("Green");
    expect(result.numericScore).toBeGreaterThanOrEqual(70);
    expect(result.isProvisional).toBe(false);
  });

  it("returns KILL for failed hard filters", () => {
    const hardResult = hardFilterCheck({
      floodZone: "AE",
      isContaminated: false,
    });
    expect(hardResult.passed).toBe(false);

    const result = computeTriageScore({
      accessScore: 90,
      drainageScore: 85,
      adjacencyScore: 80,
      environmentalScore: 95,
      utilitiesScore: 90,
      politicsScore: 75,
      zoningScore: 85,
      acreageScore: 80,
      hardFilterResult: hardResult,
    });
    expect(result.decision).toBe("KILL");
    expect(result.tier).toBe("Red");
    expect(result.numericScore).toBe(0);
    expect(result.disqualifiers).toContain("SFHA flood zone: AE");
  });

  it("returns HOLD for medium scores", () => {
    const result = computeTriageScore({
      accessScore: 55,
      drainageScore: 50,
      adjacencyScore: 60,
      environmentalScore: 55,
      utilitiesScore: 50,
      politicsScore: 45,
      zoningScore: 50,
      acreageScore: 55,
    });
    expect(result.decision).toBe("HOLD");
    expect(result.tier).toBe("Yellow");
    expect(result.numericScore).toBeGreaterThanOrEqual(40);
    expect(result.numericScore).toBeLessThan(70);
  });

  it("returns KILL for low scores", () => {
    const result = computeTriageScore({
      accessScore: 10,
      drainageScore: 15,
      adjacencyScore: 20,
      environmentalScore: 10,
      utilitiesScore: 15,
      politicsScore: 10,
      zoningScore: 15,
      acreageScore: 20,
    });
    expect(result.decision).toBe("KILL");
    expect(result.tier).toBe("Red");
    expect(result.numericScore).toBeLessThan(40);
  });

  it("marks as provisional when data is missing", () => {
    const result = computeTriageScore({
      accessScore: 90,
      drainageScore: 85,
      // adjacencyScore missing
      environmentalScore: 95,
      // utilitiesScore missing
      politicsScore: 75,
      zoningScore: 85,
      acreageScore: 80,
    });
    expect(result.isProvisional).toBe(true);
    expect(result.tier).toBe("Gray");
    expect(result.missingData).toContain("adjacency");
    expect(result.missingData).toContain("utilities");
  });

  it("normalizes weights when dimensions are missing", () => {
    // With only some dimensions provided, the score should be computed
    // from the available dimensions (no penalty for missing).
    const allPresent = computeTriageScore({
      accessScore: 80,
      drainageScore: 80,
      adjacencyScore: 80,
      environmentalScore: 80,
      utilitiesScore: 80,
      politicsScore: 80,
      zoningScore: 80,
      acreageScore: 80,
    });

    const partialPresent = computeTriageScore({
      accessScore: 80,
      drainageScore: 80,
    });

    // Both should give the same numeric score since all present scores are 80
    expect(allPresent.numericScore).toBe(80);
    expect(partialPresent.numericScore).toBe(80);
  });

  it("includes correct breakdown weights", () => {
    const result = computeTriageScore({
      accessScore: 100,
      drainageScore: 0,
      adjacencyScore: 50,
      environmentalScore: 100,
      utilitiesScore: 0,
      politicsScore: 50,
      zoningScore: 100,
      acreageScore: 50,
    });

    expect(result.breakdown.access.weight).toBe(0.15);
    expect(result.breakdown.drainage.weight).toBe(0.15);
    expect(result.breakdown.acreage.weight).toBe(0.05);
    expect(result.breakdown.access.score).toBe(100);
    expect(result.breakdown.drainage.score).toBe(0);
  });
});

describe("hardFilterCheck", () => {
  it("passes when all inputs are favorable", () => {
    const result = hardFilterCheck({
      floodZone: "X",
      isContaminated: false,
      hasUtilities: true,
      hasAccess: true,
    });
    expect(result.passed).toBe(true);
    expect(result.disqualifiers).toHaveLength(0);
  });

  it("fails for SFHA flood zones", () => {
    for (const zone of ["A", "AE", "AH", "AO", "V", "VE"]) {
      const result = hardFilterCheck({ floodZone: zone });
      expect(result.passed).toBe(false);
      expect(result.disqualifiers.length).toBeGreaterThan(0);
    }
  });

  it("passes for non-SFHA flood zones", () => {
    for (const zone of ["X", "B", "C"]) {
      const result = hardFilterCheck({ floodZone: zone });
      expect(result.passed).toBe(true);
    }
  });

  it("fails for contamination", () => {
    const result = hardFilterCheck({ isContaminated: true });
    expect(result.passed).toBe(false);
    expect(result.disqualifiers).toContain("Environmental contamination present");
  });

  it("fails for no utilities", () => {
    const result = hardFilterCheck({ hasUtilities: false });
    expect(result.passed).toBe(false);
    expect(result.disqualifiers).toContain("No utility access");
  });

  it("fails for no access", () => {
    const result = hardFilterCheck({ hasAccess: false });
    expect(result.passed).toBe(false);
    expect(result.disqualifiers).toContain("No road access");
  });

  it("fails for residential zone with industrial use", () => {
    const result = hardFilterCheck({
      currentZoning: "R-1",
      proposedUse: "SMALL_BAY_FLEX",
    });
    expect(result.passed).toBe(false);
    expect(result.disqualifiers[0]).toContain("incompatible");
  });

  it("passes when inputs are missing (no penalty for unknowns)", () => {
    const result = hardFilterCheck({});
    expect(result.passed).toBe(true);
    expect(result.disqualifiers).toHaveLength(0);
  });

  it("accumulates multiple disqualifiers", () => {
    const result = hardFilterCheck({
      floodZone: "AE",
      isContaminated: true,
      hasUtilities: false,
      hasAccess: false,
    });
    expect(result.passed).toBe(false);
    expect(result.disqualifiers).toHaveLength(4);
  });
});
