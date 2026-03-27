import { describe, it, expect } from "vitest";
import {
  gradeDataCompleteness,
  gradeCostEfficiency,
  gradeCitationQuality,
  gradeTaskSuccess,
  evaluateConsensus,
  type GraderResult,
} from "../agentGraders.service";

describe("agentGraders.service", () => {
  describe("gradeDataCompleteness", () => {
    it("returns 1.0 score when all fields are present", () => {
      const result = gradeDataCompleteness({
        expectedFields: ["name", "email", "phone"],
        returnedFields: ["name", "email", "phone"],
      });
      expect(result.score).toBe(1);
      expect(result.passed).toBe(true);
      expect(result.feedback).toBe("All fields present");
    });

    it("identifies missing fields correctly", () => {
      const result = gradeDataCompleteness({
        expectedFields: ["name", "email", "phone"],
        returnedFields: ["name", "email"],
      });
      expect(result.score).toBe(2 / 3);
      expect(result.passed).toBe(false);
      expect(result.feedback).toContain("Missing fields:");
      expect(result.feedback).toContain("phone");
    });

    it("handles empty expected fields", () => {
      const result = gradeDataCompleteness({
        expectedFields: [],
        returnedFields: [],
      });
      expect(result.score).toBe(1);
      expect(result.passed).toBe(true);
      expect(result.feedback).toBe("No fields expected");
    });

    it("passes when coverage >= 0.8", () => {
      const result = gradeDataCompleteness({
        expectedFields: ["a", "b", "c", "d", "e"],
        returnedFields: ["a", "b", "c", "d"],
      });
      expect(result.score).toBe(0.8);
      expect(result.passed).toBe(true);
    });

    it("fails when coverage < 0.8", () => {
      const result = gradeDataCompleteness({
        expectedFields: ["a", "b", "c", "d", "e"],
        returnedFields: ["a", "b", "c"],
      });
      expect(result.score).toBe(0.6);
      expect(result.passed).toBe(false);
    });
  });

  describe("gradeCostEfficiency", () => {
    it("scores under-budget runs higher than over-budget", () => {
      const underBudget = gradeCostEfficiency({
        turns: 5,
        inputTokens: 10000,
        outputTokens: 20000,
      });
      const overBudget = gradeCostEfficiency({
        turns: 20,
        inputTokens: 60000,
        outputTokens: 40000,
      });
      expect(underBudget.score).toBeGreaterThan(overBudget.score);
    });

    it("handles custom baseline values", () => {
      const result = gradeCostEfficiency({
        turns: 15,
        inputTokens: 15000,
        outputTokens: 15000,
        baselineTurns: 10,
        baselineTokens: 30000,
      });
      const expectedTurnRatio = 10 / 15; // 0.667
      const expectedTokenRatio = 30000 / 30000; // 1.0 (capped)
      const expectedScore = (expectedTurnRatio + 1.0) / 2; // 0.833
      expect(result.score).toBeCloseTo(expectedScore, 2);
      expect(result.feedback).toContain("15 turns");
      expect(result.feedback).toContain("30000 tokens");
    });

    it("passes when score >= 0.6", () => {
      const result = gradeCostEfficiency({
        turns: 10,
        inputTokens: 30000,
        outputTokens: 20000,
      });
      expect(result.score).toBeGreaterThanOrEqual(0.6);
      expect(result.passed).toBe(true);
    });

    it("fails when score < 0.6", () => {
      const result = gradeCostEfficiency({
        turns: 30,
        inputTokens: 80000,
        outputTokens: 80000,
      });
      expect(result.score).toBeLessThan(0.6);
      expect(result.passed).toBe(false);
    });

    it("caps ratio at 1.0 for under-budget values", () => {
      const result = gradeCostEfficiency({
        turns: 2,
        inputTokens: 5000,
        outputTokens: 5000,
      });
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });

  describe("gradeCitationQuality", () => {
    it("handles zero claims gracefully", () => {
      const result = gradeCitationQuality({
        totalClaims: 0,
        citedClaims: 0,
      });
      expect(result.score).toBe(1);
      expect(result.passed).toBe(true);
      expect(result.feedback).toBe("No claims to cite");
    });

    it("scores fully cited claims at 1.0", () => {
      const result = gradeCitationQuality({
        totalClaims: 5,
        citedClaims: 5,
      });
      expect(result.score).toBe(1);
      expect(result.passed).toBe(true);
      expect(result.feedback).toContain("5/5");
    });

    it("passes when citation ratio >= 0.7", () => {
      const result = gradeCitationQuality({
        totalClaims: 10,
        citedClaims: 7,
      });
      expect(result.score).toBe(0.7);
      expect(result.passed).toBe(true);
    });

    it("fails when citation ratio < 0.7", () => {
      const result = gradeCitationQuality({
        totalClaims: 10,
        citedClaims: 6,
      });
      expect(result.score).toBe(0.6);
      expect(result.passed).toBe(false);
    });

    it("reports citation counts in feedback", () => {
      const result = gradeCitationQuality({
        totalClaims: 8,
        citedClaims: 6,
      });
      expect(result.feedback).toContain("6/8");
    });
  });

  describe("gradeTaskSuccess", () => {
    it("returns 1.0 score for successful tasks", () => {
      const result = gradeTaskSuccess({ succeeded: true });
      expect(result.score).toBe(1);
      expect(result.passed).toBe(true);
      expect(result.feedback).toBe("Task completed successfully");
    });

    it("returns 0 score for failed tasks without partial credit", () => {
      const result = gradeTaskSuccess({ succeeded: false });
      expect(result.score).toBe(0);
      expect(result.passed).toBe(false);
      expect(result.feedback).toContain("Task failed");
    });

    it("awards partial credit for partially successful tasks", () => {
      const result = gradeTaskSuccess({
        succeeded: false,
        partialCredit: 0.5,
      });
      expect(result.score).toBe(0.5);
      expect(result.passed).toBe(false);
      expect(result.feedback).toContain("50%");
    });

    it("displays partial credit percentage in feedback", () => {
      const result = gradeTaskSuccess({
        succeeded: false,
        partialCredit: 0.75,
      });
      expect(result.feedback).toContain("75%");
    });
  });

  describe("evaluateConsensus", () => {
    it("returns zero results for empty grader list", () => {
      const result = evaluateConsensus([]);
      expect(result.scores.length).toBe(0);
      expect(result.avgScore).toBe(0);
      expect(result.lenientPass).toBe(false);
      expect(result.explanation).toBe("No graders ran");
    });

    it("achieves lenient pass when 75% of graders pass", () => {
      const scores: GraderResult[] = [
        { name: "g1", score: 1, passed: true, feedback: "pass" },
        { name: "g2", score: 1, passed: true, feedback: "pass" },
        { name: "g3", score: 1, passed: true, feedback: "pass" },
        { name: "g4", score: 0.5, passed: false, feedback: "fail" },
      ];
      const result = evaluateConsensus(scores);
      expect(result.lenientPass).toBe(true);
      expect(result.explanation).toContain("75%");
    });

    it("achieves lenient pass when average score > 0.85", () => {
      const scores: GraderResult[] = [
        { name: "g1", score: 0.9, passed: false, feedback: "marginal" },
        { name: "g2", score: 0.9, passed: false, feedback: "marginal" },
        { name: "g3", score: 0.9, passed: false, feedback: "marginal" },
        { name: "g4", score: 0.8, passed: false, feedback: "marginal" },
      ];
      const result = evaluateConsensus(scores);
      expect(result.avgScore).toBeGreaterThan(0.85);
      expect(result.lenientPass).toBe(true);
      expect(result.explanation).toContain("exceeds threshold");
    });

    it("fails when both conditions unmet", () => {
      const scores: GraderResult[] = [
        { name: "g1", score: 0.7, passed: false, feedback: "fail" },
        { name: "g2", score: 0.7, passed: false, feedback: "fail" },
        { name: "g3", score: 0.75, passed: true, feedback: "marginal" },
      ];
      const result = evaluateConsensus(scores);
      const passCount = scores.filter((s) => s.passed).length;
      expect(passCount).toBe(1);
      expect(result.lenientPass).toBe(false);
      expect(result.explanation).toContain("Only");
    });

    it("calculates correct average score", () => {
      const scores: GraderResult[] = [
        { name: "g1", score: 0.5, passed: false, feedback: "" },
        { name: "g2", score: 1, passed: true, feedback: "" },
      ];
      const result = evaluateConsensus(scores);
      expect(result.avgScore).toBe(0.75);
    });

    it("includes all grader results in output", () => {
      const scores: GraderResult[] = [
        { name: "g1", score: 1, passed: true, feedback: "pass" },
        { name: "g2", score: 0.5, passed: false, feedback: "fail" },
      ];
      const result = evaluateConsensus(scores);
      expect(result.scores).toEqual(scores);
      expect(result.scores.length).toBe(2);
    });

    it("achieves exact 75% pass ratio", () => {
      const scores: GraderResult[] = [
        { name: "g1", score: 1, passed: true, feedback: "pass" },
        { name: "g2", score: 1, passed: true, feedback: "pass" },
        { name: "g3", score: 1, passed: true, feedback: "pass" },
        { name: "g4", score: 0.1, passed: false, feedback: "fail" },
      ];
      const result = evaluateConsensus(scores);
      expect(result.lenientPass).toBe(true);
    });

    it("fails at 74% pass ratio", () => {
      const scores: GraderResult[] = [
        { name: "g1", score: 1, passed: true, feedback: "pass" },
        { name: "g2", score: 1, passed: true, feedback: "pass" },
        { name: "g3", score: 1, passed: true, feedback: "pass" },
        { name: "g4", score: 0.5, passed: false, feedback: "fail" },
        { name: "g5", score: 0.5, passed: false, feedback: "fail" },
      ];
      const result = evaluateConsensus(scores);
      const passRatio = 3 / 5;
      expect(passRatio).toBeLessThan(0.75);
      expect(result.lenientPass).toBe(false);
    });

    it("achieves exact 0.85 average threshold", () => {
      const scores: GraderResult[] = [
        { name: "g1", score: 0.85, passed: false, feedback: "" },
        { name: "g2", score: 0.85, passed: false, feedback: "" },
      ];
      const result = evaluateConsensus(scores);
      expect(result.avgScore).toBe(0.85);
      expect(result.lenientPass).toBe(true);
    });
  });
});
