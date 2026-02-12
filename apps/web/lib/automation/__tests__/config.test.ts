import { AUTOMATION_CONFIG } from "../config";

describe("AUTOMATION_CONFIG", () => {
  describe("enrichment configuration", () => {
    it("should have correct autoEnrichMinConfidence", () => {
      expect(AUTOMATION_CONFIG.enrichment.autoEnrichMinConfidence).toBe(0.9);
    });

    it("should have correct reviewMinConfidence", () => {
      expect(AUTOMATION_CONFIG.enrichment.reviewMinConfidence).toBe(0.5);
    });

    it("should have correct maxAttemptsPerParcel", () => {
      expect(AUTOMATION_CONFIG.enrichment.maxAttemptsPerParcel).toBe(1);
    });
  });

  describe("triage configuration", () => {
    it("should have correct maxRunsPerDealPerDay", () => {
      expect(AUTOMATION_CONFIG.triage.maxRunsPerDealPerDay).toBe(1);
    });

    it("should have correct killConfirmationWindowHours", () => {
      expect(AUTOMATION_CONFIG.triage.killConfirmationWindowHours).toBe(48);
    });
  });

  describe("taskExecution configuration", () => {
    it("should have correct maxConcurrentPerDeal", () => {
      expect(AUTOMATION_CONFIG.taskExecution.maxConcurrentPerDeal).toBe(5);
    });

    it("should have correct timeoutMs", () => {
      expect(AUTOMATION_CONFIG.taskExecution.timeoutMs).toBe(300_000);
    });

    it("should have correct minOutputLength", () => {
      expect(AUTOMATION_CONFIG.taskExecution.minOutputLength).toBe(50);
    });

    it("should have correct humanOnlyKeywords", () => {
      expect(AUTOMATION_CONFIG.taskExecution.humanOnlyKeywords).toEqual([
        "call",
        "meet",
        "negotiate",
        "sign",
        "schedule",
      ]);
    });

    it("should have humanOnlyKeywords as an array with 5 elements", () => {
      expect(Array.isArray(AUTOMATION_CONFIG.taskExecution.humanOnlyKeywords)).toBe(true);
      expect(AUTOMATION_CONFIG.taskExecution.humanOnlyKeywords).toHaveLength(5);
    });
  });

  describe("intake configuration", () => {
    it("should have correct maxAutoCreatedPerDay", () => {
      expect(AUTOMATION_CONFIG.intake.maxAutoCreatedPerDay).toBe(10);
    });

    it("should have correct vetoWindowHours", () => {
      expect(AUTOMATION_CONFIG.intake.vetoWindowHours).toBe(24);
    });

    it("should have correct coveredParishes", () => {
      expect(AUTOMATION_CONFIG.intake.coveredParishes).toEqual([
        "East Baton Rouge",
        "Ascension",
        "Livingston",
        "West Baton Rouge",
        "Iberville",
      ]);
    });

    it("should have coveredParishes as an array with 5 elements", () => {
      expect(Array.isArray(AUTOMATION_CONFIG.intake.coveredParishes)).toBe(true);
      expect(AUTOMATION_CONFIG.intake.coveredParishes).toHaveLength(5);
    });
  });

  describe("advancement configuration", () => {
    it("should have correct reminderAfterHours", () => {
      expect(AUTOMATION_CONFIG.advancement.reminderAfterHours).toBe(48);
    });
  });

  describe("buyerOutreach configuration", () => {
    it("should have correct maxEmailsPerDealPerWeek", () => {
      expect(AUTOMATION_CONFIG.buyerOutreach.maxEmailsPerDealPerWeek).toBe(20);
    });

    it("should have correct coolOffDays", () => {
      expect(AUTOMATION_CONFIG.buyerOutreach.coolOffDays).toBe(15);
    });

    it("should have correct neverAutoSend", () => {
      expect(AUTOMATION_CONFIG.buyerOutreach.neverAutoSend).toBe(true);
    });
  });

  describe("documents configuration", () => {
    it("should have correct maxFileSizeMb", () => {
      expect(AUTOMATION_CONFIG.documents.maxFileSizeMb).toBe(50);
    });

    it("should have correct maxBatchSize", () => {
      expect(AUTOMATION_CONFIG.documents.maxBatchSize).toBe(10);
    });

    it("should have correct classificationMinConfidence", () => {
      expect(AUTOMATION_CONFIG.documents.classificationMinConfidence).toBe(0.7);
    });
  });

  describe("intelligenceKpi configuration", () => {
    it("should have expected entitlement KPI guardrails", () => {
      expect(AUTOMATION_CONFIG.intelligenceKpi.lookbackMonths).toBe(36);
      expect(AUTOMATION_CONFIG.intelligenceKpi.snapshotLookbackMonths).toBe(72);
      expect(AUTOMATION_CONFIG.intelligenceKpi.minSampleSize).toBe(12);
      expect(AUTOMATION_CONFIG.intelligenceKpi.minMatchedPredictions).toBe(8);
      expect(AUTOMATION_CONFIG.intelligenceKpi.maxMedianTimelineMaeDays).toBe(30);
      expect(AUTOMATION_CONFIG.intelligenceKpi.maxCalibrationGapAbs).toBe(0.12);
      expect(AUTOMATION_CONFIG.intelligenceKpi.alertCooldownHours).toBe(24);
    });
  });

  describe("immutability", () => {
    it("should be frozen (immutable)", () => {
      expect(Object.isFrozen(AUTOMATION_CONFIG)).toBe(true);
    });

    it("should have frozen nested objects", () => {
      expect(Object.isFrozen(AUTOMATION_CONFIG.enrichment)).toBe(true);
      expect(Object.isFrozen(AUTOMATION_CONFIG.triage)).toBe(true);
      expect(Object.isFrozen(AUTOMATION_CONFIG.taskExecution)).toBe(true);
      expect(Object.isFrozen(AUTOMATION_CONFIG.intake)).toBe(true);
      expect(Object.isFrozen(AUTOMATION_CONFIG.advancement)).toBe(true);
      expect(Object.isFrozen(AUTOMATION_CONFIG.buyerOutreach)).toBe(true);
      expect(Object.isFrozen(AUTOMATION_CONFIG.documents)).toBe(true);
      expect(Object.isFrozen(AUTOMATION_CONFIG.intelligenceKpi)).toBe(true);
    });

    it("should not allow modification of top-level properties", () => {
      expect(() => {
        (AUTOMATION_CONFIG as Record<string, unknown>).enrichment = {};
      }).toThrow();
    });

    it("should not allow modification of nested properties", () => {
      expect(() => {
        (AUTOMATION_CONFIG.enrichment as Record<string, unknown>).autoEnrichMinConfidence = 0.5;
      }).toThrow();
    });

    it("should not allow modification of arrays", () => {
      expect(() => {
        (AUTOMATION_CONFIG.taskExecution.humanOnlyKeywords as unknown as string[]).push("test");
      }).toThrow();
    });
  });
});
