import { describe, it, expect, beforeEach } from "vitest";
import {
  shouldOptimize,
  buildMetaprompt,
  extractFailedGraders,
  buildPromptPatch,
  isRetryExhausted,
  type GraderResult,
} from "../promptOptimization.service";

const mockGraderResult = (overrides?: Partial<GraderResult>): GraderResult => ({
  name: "test-grader",
  score: 0.8,
  passed: true,
  feedback: "Test feedback",
  ...overrides,
});

describe("promptOptimization.service", () => {
  describe("shouldOptimize", () => {
    it("returns true when avgScore below threshold and not lenient pass", () => {
      const result = shouldOptimize(0.5, false);
      expect(result).toBe(true);
    });

    it("returns false when lenient pass is true", () => {
      const result = shouldOptimize(0.5, true);
      expect(result).toBe(false);
    });

    it("returns false when avgScore above threshold", () => {
      const result = shouldOptimize(0.8, false);
      expect(result).toBe(false);
    });

    it("returns false when avgScore equals threshold", () => {
      const result = shouldOptimize(0.7, false);
      expect(result).toBe(false);
    });

    it("returns true when avgScore just below threshold and not lenient pass", () => {
      const result = shouldOptimize(0.69, false);
      expect(result).toBe(true);
    });
  });

  describe("buildMetaprompt", () => {
    it("includes current prompt, failures, and instructions", () => {
      const failedGrader = mockGraderResult({
        name: "relevance-grader",
        score: 0.4,
        passed: false,
        feedback: "Output missing key details",
      });

      const prompt = buildMetaprompt({
        currentPrompt: "You are a helpful agent",
        failedGraders: [failedGrader],
        runOutput: "Some output",
        taskDescription: "Find the answer to the question",
      });

      expect(prompt).toContain("You are an expert prompt engineer");
      expect(prompt).toContain("You are a helpful agent");
      expect(prompt).toContain("relevance-grader");
      expect(prompt).toContain("0.40");
      expect(prompt).toContain("Output missing key details");
      expect(prompt).toContain("Find the answer to the question");
      expect(prompt).toContain("Some output");
    });

    it("truncates long inputs to reasonable sizes", () => {
      const longPrompt = "x".repeat(3000);
      const longOutput = "y".repeat(2000);
      const longTask = "z".repeat(1000);

      const prompt = buildMetaprompt({
        currentPrompt: longPrompt,
        failedGraders: [],
        runOutput: longOutput,
        taskDescription: longTask,
      });

      expect(prompt.length).toBeLessThan(
        longPrompt.length + longOutput.length + longTask.length
      );
      expect(prompt).toContain(longPrompt.slice(0, 2000));
      expect(prompt).toContain(longOutput.slice(0, 1000));
      expect(prompt).toContain(longTask.slice(0, 500));
    });

    it("formats grader feedback with score and name", () => {
      const grader1 = mockGraderResult({
        name: "completeness",
        score: 0.3,
        passed: false,
        feedback: "Missing sections",
      });
      const grader2 = mockGraderResult({
        name: "accuracy",
        score: 0.5,
        passed: false,
        feedback: "Contains errors",
      });

      const prompt = buildMetaprompt({
        currentPrompt: "Test",
        failedGraders: [grader1, grader2],
        runOutput: "Output",
        taskDescription: "Task",
      });

      expect(prompt).toContain("- completeness: score 0.30 — Missing sections");
      expect(prompt).toContain("- accuracy: score 0.50 — Contains errors");
    });
  });

  describe("extractFailedGraders", () => {
    it("filters only non-passed graders", () => {
      const passed = mockGraderResult({ name: "passed-grader", passed: true });
      const failed1 = mockGraderResult({
        name: "failed-grader-1",
        passed: false,
      });
      const failed2 = mockGraderResult({
        name: "failed-grader-2",
        passed: false,
      });

      const scores = [passed, failed1, failed2];
      const result = extractFailedGraders(scores);

      expect(result).toHaveLength(2);
      expect(result).not.toContain(passed);
      expect(result).toContain(failed1);
      expect(result).toContain(failed2);
    });

    it("returns empty array when all pass", () => {
      const scores = [
        mockGraderResult({ name: "grader1", passed: true }),
        mockGraderResult({ name: "grader2", passed: true }),
      ];

      const result = extractFailedGraders(scores);

      expect(result).toHaveLength(0);
    });

    it("returns all graders when none pass", () => {
      const scores = [
        mockGraderResult({ name: "grader1", passed: false }),
        mockGraderResult({ name: "grader2", passed: false }),
      ];

      const result = extractFailedGraders(scores);

      expect(result).toHaveLength(2);
    });
  });

  describe("buildPromptPatch", () => {
    it("creates correct structure", () => {
      const triggerScores = [
        mockGraderResult({
          name: "completeness",
          score: 0.3,
          passed: false,
        }),
      ];

      const patch = buildPromptPatch({
        agentId: "finance-agent",
        version: 2,
        originalPromptHash: "abc123",
        patchedInstructions: "You are a better agent now",
        triggerScores,
      });

      expect(patch).toEqual({
        agentId: "finance-agent",
        version: 2,
        originalPromptHash: "abc123",
        patchDescription: expect.stringContaining("completeness"),
        patchedInstructions: "You are a better agent now",
        triggerScores,
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}/),
      });
    });

    it("includes all failed grader names in description", () => {
      const triggerScores = [
        mockGraderResult({ name: "completeness", passed: false }),
        mockGraderResult({ name: "clarity", passed: false }),
        mockGraderResult({ name: "accuracy", passed: false }),
      ];

      const patch = buildPromptPatch({
        agentId: "test-agent",
        version: 1,
        originalPromptHash: "hash",
        patchedInstructions: "Instructions",
        triggerScores,
      });

      expect(patch.patchDescription).toContain("completeness");
      expect(patch.patchDescription).toContain("clarity");
      expect(patch.patchDescription).toContain("accuracy");
    });

    it("creates valid ISO timestamp", () => {
      const patch = buildPromptPatch({
        agentId: "test",
        version: 1,
        originalPromptHash: "hash",
        patchedInstructions: "Instructions",
        triggerScores: [],
      });

      const timestamp = new Date(patch.createdAt);
      expect(timestamp.getTime()).toBeGreaterThan(0);
    });
  });

  describe("isRetryExhausted", () => {
    it("returns true at max retries", () => {
      expect(isRetryExhausted(3)).toBe(true);
    });

    it("returns false below max", () => {
      expect(isRetryExhausted(0)).toBe(false);
      expect(isRetryExhausted(1)).toBe(false);
      expect(isRetryExhausted(2)).toBe(false);
    });

    it("returns true above max", () => {
      expect(isRetryExhausted(4)).toBe(true);
      expect(isRetryExhausted(10)).toBe(true);
    });
  });
});
