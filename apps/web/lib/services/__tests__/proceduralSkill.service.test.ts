import { describe, expect, it, vi, beforeEach } from "vitest";
import { prisma } from "@entitlement-os/db";

import { __testables, upsertProceduralSkillsFromEpisode } from "@/lib/services/proceduralSkill.service";

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    episodicEntry: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    proceduralSkill: {
      upsert: vi.fn(),
    },
    proceduralSkillEpisode: {
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/services/knowledgeBase.service", () => ({
  ingestKnowledge: vi.fn().mockResolvedValue(["knowledge-id-1"]),
  deleteKnowledge: vi.fn().mockResolvedValue(null),
}));

describe("procedural skill promotion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("empty tool-sequence guard", () => {
    it("returns zero skills when episode has empty toolSequence", async () => {
      const orgId = "org-1";
      const episodeId = "episode-1";

      vi.mocked(prisma.episodicEntry.findFirst).mockResolvedValueOnce({
        id: episodeId,
        taskType: "entitlement_review",
        agentId: "strategy-agent",
        toolSequence: [],
      });

      // findMany is called before the guard, but empty toolSequence returns early
      vi.mocked(prisma.episodicEntry.findMany).mockResolvedValueOnce([]);

      const result = await upsertProceduralSkillsFromEpisode({
        orgId,
        episodicEntryId: episodeId,
      });

      expect(result.updatedSkillCount).toBe(0);
      expect(result.skillIds).toEqual([]);
      expect(prisma.proceduralSkill.upsert).not.toHaveBeenCalled();
    });

    it("returns zero skills when cluster tool sequences normalize to empty", async () => {
      const orgId = "org-1";
      const episodeId = "episode-1";

      vi.mocked(prisma.episodicEntry.findFirst).mockResolvedValueOnce({
        id: episodeId,
        taskType: "risk_assessment",
        agentId: "finance-agent",
        toolSequence: ["  ", "  "],
      });

      vi.mocked(prisma.episodicEntry.findMany).mockResolvedValueOnce([
        {
          id: "episode-1",
          summary: "Risk assessment completed",
          outcome: "SUCCESS",
          confidence: 0.9,
          toolSequence: ["  "],
          metadata: null,
        },
        {
          id: "episode-2",
          summary: "Another risk assessment",
          outcome: "SUCCESS",
          confidence: 0.85,
          toolSequence: ["  ", "  "],
          metadata: null,
        },
        {
          id: "episode-3",
          summary: "Third risk assessment",
          outcome: "SUCCESS",
          confidence: 0.8,
          toolSequence: ["  "],
          metadata: null,
        },
      ]);

      const result = await upsertProceduralSkillsFromEpisode({
        orgId,
        episodicEntryId: episodeId,
      });

      expect(result.updatedSkillCount).toBe(0);
      expect(result.skillIds).toEqual([]);
      expect(prisma.proceduralSkill.upsert).not.toHaveBeenCalled();
    });

    it("skips skill creation even when thresholds are met (>= minEpisodes, success rate >= minRate) but toolSequence is empty", async () => {
      const orgId = "org-1";
      const episodeId = "episode-1";

      vi.mocked(prisma.episodicEntry.findFirst).mockResolvedValueOnce({
        id: episodeId,
        taskType: "environmental_screening",
        agentId: "screening-agent",
        toolSequence: [],
      });

      vi.mocked(prisma.episodicEntry.findMany).mockResolvedValueOnce([
        {
          id: "episode-1",
          summary: "Screening passed",
          outcome: "SUCCESS",
          confidence: 0.95,
          toolSequence: [],
          metadata: null,
        },
        {
          id: "episode-2",
          summary: "Screening passed",
          outcome: "SUCCESS",
          confidence: 0.9,
          toolSequence: [],
          metadata: null,
        },
        {
          id: "episode-3",
          summary: "Screening passed",
          outcome: "SUCCESS",
          confidence: 0.88,
          toolSequence: [],
          metadata: null,
        },
        {
          id: "episode-4",
          summary: "Screening passed",
          outcome: "SUCCESS",
          confidence: 0.85,
          toolSequence: [],
          metadata: null,
        },
        {
          id: "episode-5",
          summary: "Screening passed",
          outcome: "SUCCESS",
          confidence: 0.92,
          toolSequence: [],
          metadata: null,
        },
      ]);

      const result = await upsertProceduralSkillsFromEpisode({
        orgId,
        episodicEntryId: episodeId,
      });

      expect(result.updatedSkillCount).toBe(0);
      expect(result.skillIds).toEqual([]);
      expect(prisma.proceduralSkill.upsert).not.toHaveBeenCalled();
    });
  });

  describe("normalizeToolSequence", () => {
    it("removes empty strings and consecutive duplicates", () => {
      const input = ["search_parcels", "search_parcels", "screen_flood", "", "screen_flood"];
      const result = __testables.normalizeToolSequence(input);
      expect(result).toEqual(["search_parcels", "screen_flood"]);
    });

    it("preserves non-consecutive occurrences of the same tool", () => {
      const input = ["search_parcels", "screen_flood", "search_parcels"];
      const result = __testables.normalizeToolSequence(input);
      expect(result).toEqual(["search_parcels", "screen_flood", "search_parcels"]);
    });

    it("trims whitespace from tool names", () => {
      const input = ["  search_parcels  ", "screen_flood"];
      const result = __testables.normalizeToolSequence(input);
      expect(result).toEqual(["search_parcels", "screen_flood"]);
    });

    it("returns empty array when input is all whitespace", () => {
      const input = ["  ", "  ", "\t"];
      const result = __testables.normalizeToolSequence(input);
      expect(result).toEqual([]);
    });
  });

  describe("buildProcedureDedupeHash", () => {
    it("produces consistent hash for same inputs", () => {
      const params = {
        taskType: "market_research",
        agentId: "strategy-agent",
        toolSequence: ["web_search", "comp_analysis"],
      };

      const hash1 = __testables.buildProcedureDedupeHash(params);
      const hash2 = __testables.buildProcedureDedupeHash(params);

      expect(hash1).toBe(hash2);
    });

    it("produces different hashes for different toolSequences", () => {
      const base = {
        taskType: "market_research",
        agentId: "strategy-agent",
      };

      const hash1 = __testables.buildProcedureDedupeHash({
        ...base,
        toolSequence: ["web_search", "comp_analysis"],
      });
      const hash2 = __testables.buildProcedureDedupeHash({
        ...base,
        toolSequence: ["web_search"],
      });

      expect(hash1).not.toBe(hash2);
    });

    it("normalizes sequences before hashing", () => {
      const hash1 = __testables.buildProcedureDedupeHash({
        taskType: "triage",
        agentId: "coordinator",
        toolSequence: ["assess_quality", "assess_quality", "flag_issues"],
      });

      const hash2 = __testables.buildProcedureDedupeHash({
        taskType: "triage",
        agentId: "coordinator",
        toolSequence: ["assess_quality", "flag_issues"],
      });

      expect(hash1).toBe(hash2);
    });
  });
});
