import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, deleteKnowledgeMock, ingestKnowledgeMock } = vi.hoisted(() => ({
  dbMock: {
    prisma: {
      trajectoryLog: {
        findFirst: vi.fn(),
      },
      episodicEntry: {
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

import { createEpisodicEntryFromTrajectoryLog } from "../episodicMemory.service";

describe("createEpisodicEntryFromTrajectoryLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteKnowledgeMock.mockResolvedValue(0);
    ingestKnowledgeMock.mockResolvedValue(["chunk-1", "chunk-2"]);
    dbMock.prisma.episodicEntry.upsert.mockResolvedValue({ id: "episode-1" });
    dbMock.prisma.trajectoryLog.findFirst.mockResolvedValue({
      id: "trajectory-1",
      finalOutput: "Use the zoning memo and comparable approvals.",
      toolCalls: ["search_knowledge_base", "screenZoning"],
      trustJson: {
        confidence: 0.81,
      },
      evidenceCitations: [{ id: "citation-1" }],
      retrievedContextSummary: {
        query: "zoning memo",
        resultCount: 1,
      },
    });
  });

  it("creates an episodic entry, ingests episodic_summary, and uses the first chunk id", async () => {
    const result = await createEpisodicEntryFromTrajectoryLog({
      orgId: "org-1",
      userId: "user-1",
      runId: "run-1",
      dealId: "deal-1",
      jurisdictionId: "jurisdiction-1",
      conversationId: "conversation-1",
      runType: "TRIAGE",
      queryIntent: "entitlements",
      trajectoryLogId: "trajectory-1",
      agentId: "Research",
      taskInput: "Find the zoning path for this parcel.",
      status: "succeeded",
    });

    expect(result).toEqual({
      episodicEntryId: "episode-1",
      embeddingId: "chunk-1",
    });
    expect(deleteKnowledgeMock).toHaveBeenCalledWith(
      "org-1",
      "episode:run-1:Research:TRIAGE",
    );
    expect(ingestKnowledgeMock).toHaveBeenCalledWith(
      "org-1",
      "episodic_summary",
      "episode:run-1:Research:TRIAGE",
      expect.stringContaining("Task Type: TRIAGE"),
      expect.objectContaining({
        runId: "run-1",
        agentId: "Research",
        taskType: "TRIAGE",
        outcome: "SUCCESS",
        confidence: 0.81,
      }),
    );
    expect(dbMock.prisma.episodicEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId_runId_agentId_taskType: {
            orgId: "org-1",
            runId: "run-1",
            agentId: "Research",
            taskType: "TRIAGE",
          },
        },
        create: expect.objectContaining({
          embeddingId: "chunk-1",
          outcome: "SUCCESS",
          toolSequence: ["search_knowledge_base", "screenZoning"],
        }),
      }),
    );
  });

  it.each([
    ["failed", "FAILURE"],
    ["canceled", "PARTIAL"],
  ] as const)(
    "maps %s runs to %s episodic outcomes",
    async (status, expectedOutcome) => {
      await createEpisodicEntryFromTrajectoryLog({
        orgId: "org-1",
        userId: "user-1",
        runId: `run-${status}`,
        trajectoryLogId: "trajectory-1",
        agentId: "Research",
        taskInput: "Review the prior run.",
        status,
      });

      expect(dbMock.prisma.episodicEntry.upsert).toHaveBeenLastCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            outcome: expectedOutcome,
          }),
          update: expect.objectContaining({
            outcome: expectedOutcome,
          }),
        }),
      );
    },
  );
});
