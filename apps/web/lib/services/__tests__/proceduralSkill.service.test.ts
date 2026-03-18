import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, deleteKnowledgeMock, ingestKnowledgeMock } = vi.hoisted(() => ({
  dbMock: {
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
  },
  deleteKnowledgeMock: vi.fn(),
  ingestKnowledgeMock: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => dbMock);
vi.mock("@/lib/services/knowledgeBase.service", () => ({
  deleteKnowledge: deleteKnowledgeMock,
  ingestKnowledge: ingestKnowledgeMock,
}));

import {
  buildProcedureDedupeHash,
  normalizeToolSequence,
  upsertProceduralSkillsFromEpisode,
} from "../proceduralSkill.service";

describe("procedural skill promotion helpers", () => {
  it("normalizes tool sequences by removing adjacent duplicates", () => {
    expect(
      normalizeToolSequence([
        "search_knowledge_base",
        "search_knowledge_base",
        "screenZoning",
        "",
        "screenZoning",
      ]),
    ).toEqual(["search_knowledge_base", "screenZoning"]);
  });

  it("builds a stable dedupe hash from task type, agent, and normalized tools", () => {
    const hashA = buildProcedureDedupeHash({
      taskType: "TRIAGE",
      agentId: "Research",
      toolSequence: ["search_knowledge_base", "search_knowledge_base", "screenZoning"],
    });
    const hashB = buildProcedureDedupeHash({
      taskType: "TRIAGE",
      agentId: "Research",
      toolSequence: ["search_knowledge_base", "screenZoning"],
    });

    expect(hashA).toBe(hashB);
  });
});

describe("upsertProceduralSkillsFromEpisode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteKnowledgeMock.mockResolvedValue(0);
    ingestKnowledgeMock.mockResolvedValue(["chunk-1"]);
    dbMock.prisma.proceduralSkill.upsert.mockResolvedValue({ id: "skill-1" });
    dbMock.prisma.proceduralSkillEpisode.deleteMany.mockResolvedValue({ count: 0 });
    dbMock.prisma.proceduralSkillEpisode.upsert.mockResolvedValue({ id: "link-1" });
  });

  it("does not create a skill below the promotion threshold", async () => {
    dbMock.prisma.episodicEntry.findFirst.mockResolvedValue({
      id: "episode-1",
      taskType: "TRIAGE",
      agentId: "Research",
      toolSequence: ["search_knowledge_base", "screenZoning"],
    });
    dbMock.prisma.episodicEntry.findMany.mockResolvedValue([
      {
        id: "episode-1",
        summary: "Success one",
        outcome: "SUCCESS",
        confidence: 0.9,
        toolSequence: ["search_knowledge_base", "screenZoning"],
        metadata: null,
      },
      {
        id: "episode-2",
        summary: "Success two",
        outcome: "SUCCESS",
        confidence: 0.85,
        toolSequence: ["search_knowledge_base", "screenZoning"],
        metadata: null,
      },
    ]);

    const result = await upsertProceduralSkillsFromEpisode({
      orgId: "org-1",
      episodicEntryId: "episode-1",
    });

    expect(result).toEqual({
      updatedSkillCount: 0,
      skillIds: [],
    });
    expect(dbMock.prisma.proceduralSkill.upsert).not.toHaveBeenCalled();
  });

  it("creates a skill at the threshold and links supporting episodes", async () => {
    dbMock.prisma.episodicEntry.findFirst.mockResolvedValue({
      id: "episode-1",
      taskType: "TRIAGE",
      agentId: "Research",
      toolSequence: ["search_knowledge_base", "screenZoning"],
    });
    dbMock.prisma.episodicEntry.findMany.mockResolvedValue([
      {
        id: "episode-1",
        summary: "Success one",
        outcome: "SUCCESS",
        confidence: 0.9,
        toolSequence: ["search_knowledge_base", "screenZoning"],
        metadata: { evidenceCount: 1 },
      },
      {
        id: "episode-2",
        summary: "Success two",
        outcome: "SUCCESS",
        confidence: 0.88,
        toolSequence: ["search_knowledge_base", "screenZoning"],
        metadata: { evidenceCount: 2 },
      },
      {
        id: "episode-3",
        summary: "Success three",
        outcome: "SUCCESS",
        confidence: 0.84,
        toolSequence: ["search_knowledge_base", "screenZoning"],
        metadata: { evidenceCount: 1 },
      },
    ]);

    const result = await upsertProceduralSkillsFromEpisode({
      orgId: "org-1",
      episodicEntryId: "episode-1",
    });

    expect(result).toEqual({
      updatedSkillCount: 1,
      skillIds: ["skill-1"],
    });
    expect(ingestKnowledgeMock).toHaveBeenCalledWith(
      "org-1",
      "procedural_skill",
      expect.stringMatching(/^skill:/),
      expect.stringContaining("# TRIAGE Research procedure"),
      expect.objectContaining({
        taskType: "TRIAGE",
        agentId: "Research",
        successCount: 3,
        failCount: 0,
      }),
    );
    expect(dbMock.prisma.proceduralSkill.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgId_dedupeHash: expect.objectContaining({
            orgId: "org-1",
          }),
        }),
      }),
    );
    expect(dbMock.prisma.proceduralSkillEpisode.upsert).toHaveBeenCalledTimes(3);
  });

  it("updates the same skill on repeated promotions via the dedupe hash", async () => {
    dbMock.prisma.episodicEntry.findFirst
      .mockResolvedValueOnce({
        id: "episode-1",
        taskType: "TRIAGE",
        agentId: "Research",
        toolSequence: ["search_knowledge_base", "screenZoning"],
      })
      .mockResolvedValueOnce({
        id: "episode-2",
        taskType: "TRIAGE",
        agentId: "Research",
        toolSequence: ["search_knowledge_base", "screenZoning"],
      });
    dbMock.prisma.episodicEntry.findMany.mockResolvedValue([
      {
        id: "episode-1",
        summary: "Success one",
        outcome: "SUCCESS",
        confidence: 0.9,
        toolSequence: ["search_knowledge_base", "screenZoning"],
        metadata: null,
      },
      {
        id: "episode-2",
        summary: "Success two",
        outcome: "SUCCESS",
        confidence: 0.88,
        toolSequence: ["search_knowledge_base", "screenZoning"],
        metadata: null,
      },
      {
        id: "episode-3",
        summary: "Success three",
        outcome: "SUCCESS",
        confidence: 0.84,
        toolSequence: ["search_knowledge_base", "screenZoning"],
        metadata: null,
      },
    ]);

    await upsertProceduralSkillsFromEpisode({
      orgId: "org-1",
      episodicEntryId: "episode-1",
    });
    await upsertProceduralSkillsFromEpisode({
      orgId: "org-1",
      episodicEntryId: "episode-2",
    });

    const firstWhere =
      dbMock.prisma.proceduralSkill.upsert.mock.calls[0]?.[0]?.where?.orgId_dedupeHash;
    const secondWhere =
      dbMock.prisma.proceduralSkill.upsert.mock.calls[1]?.[0]?.where?.orgId_dedupeHash;

    expect(firstWhere).toEqual(secondWhere);
  });
});
