import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    prisma: {
      run: {
        findFirst: vi.fn(),
      },
      message: {
        findFirst: vi.fn(),
      },
      trajectoryLog: {
        upsert: vi.fn(),
      },
    },
  },
}));

vi.mock("@entitlement-os/db", () => dbMock);

import { createTrajectoryLogFromRun } from "../trajectoryLog.service";

describe("createTrajectoryLogFromRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.prisma.trajectoryLog.upsert.mockResolvedValue({ id: "trajectory-1" });
  });

  it("creates one row from a completed run and maps trust/evidence/tool fields", async () => {
    dbMock.prisma.run.findFirst.mockResolvedValue({
      id: "run-1",
      dealId: "deal-db",
      jurisdictionId: "jurisdiction-db",
      outputJson: {
        lastAgentName: "Research",
        runState: {
          retrievalContext: {
            query: "zoning screen",
            resultCount: 2,
          },
        },
        finalReport: {
          execution_plan: {
            summary: "Collect evidence and recommend a path.",
          },
        },
        toolsInvoked: ["search_knowledge_base", "screenZoning"],
        finalOutput: "Proceed with a zoning memo.",
        confidence: 0.83,
        missingEvidence: ["Need survey."],
        verificationSteps: ["Check zoning ordinance."],
        toolFailures: ["One transient timeout."],
        proofChecks: ["evidence:satisfied"],
        retryMode: "local",
        fallbackLineage: ["primary"],
        fallbackReason: "none",
        evidenceCitations: [{ sourceId: "citation-1" }],
        packVersionsUsed: ["v1"],
        durationMs: 1234,
        usage: {
          costUsd: 1.25,
          inputTokens: 120,
        },
      },
      trajectory: [{ step: "from-run-column" }],
    });

    const result = await createTrajectoryLogFromRun({
      runId: "run-1",
      orgId: "org-1",
      userId: "user-1",
      conversationId: "conversation-1",
      dealId: "deal-input",
      jurisdictionId: "jurisdiction-input",
      runType: "TRIAGE",
      status: "failed",
      inputPreview: "Assess the zoning risk for this deal.",
      queryIntent: "entitlements",
    });

    expect(result).toEqual({
      trajectoryLogId: "trajectory-1",
      agentId: "Research",
      taskInput: "Assess the zoning risk for this deal.",
    });

    expect(dbMock.prisma.trajectoryLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          runId_agentId: {
            runId: "run-1",
            agentId: "Research",
          },
        },
        create: expect.objectContaining({
          orgId: "org-1",
          runId: "run-1",
          agentId: "Research",
          conversationId: "conversation-1",
          dealId: "deal-input",
          jurisdictionId: "jurisdiction-input",
          taskInput: "Assess the zoning risk for this deal.",
          retrievedContextSummary: {
            query: "zoning screen",
            resultCount: 2,
          },
          plan: "Collect evidence and recommend a path.",
          toolCalls: ["search_knowledge_base", "screenZoning"],
          toolResults: Prisma.JsonNull,
          intermediateSteps: [{ step: "from-run-column" }],
          finalOutput: "Proceed with a zoning memo.",
          reflection: Prisma.JsonNull,
          evaluatorScore: 0.83,
          latencyMs: 1234,
          tokenUsage: {
            costUsd: 1.25,
            inputTokens: 120,
          },
          costUsd: 1.25,
          trustJson: {
            confidence: 0.83,
            missingEvidence: ["Need survey."],
            verificationSteps: ["Check zoning ordinance."],
            toolFailures: ["One transient timeout."],
            proofChecks: ["evidence:satisfied"],
            retryMode: "local",
            fallbackLineage: ["primary"],
            fallbackReason: "none",
          },
          evidenceCitations: [{ sourceId: "citation-1" }],
          packVersionsUsed: ["v1"],
          riskEvents: {
            status: "failed",
            missingEvidence: ["Need survey."],
            proofChecks: ["evidence:satisfied"],
            toolFailures: ["One transient timeout."],
          },
        }),
      }),
    );
  });

  it("uses inputPreview when no conversation exists", async () => {
    dbMock.prisma.run.findFirst.mockResolvedValue({
      id: "run-2",
      dealId: null,
      jurisdictionId: null,
      outputJson: {
        toolsInvoked: [],
        finalOutput: "Done.",
      },
      trajectory: null,
    });

    await createTrajectoryLogFromRun({
      runId: "run-2",
      orgId: "org-1",
      userId: "user-1",
      status: "succeeded",
      inputPreview: "Find similar entitlement wins.",
    });

    expect(dbMock.prisma.message.findFirst).not.toHaveBeenCalled();
    expect(dbMock.prisma.trajectoryLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          taskInput: "Find similar entitlement wins.",
        }),
      }),
    );
  });

  it("falls back to the latest user message when inputPreview is missing", async () => {
    dbMock.prisma.run.findFirst.mockResolvedValue({
      id: "run-3",
      dealId: null,
      jurisdictionId: null,
      outputJson: {
        toolsInvoked: [],
        finalOutput: "Done.",
      },
      trajectory: null,
    });
    dbMock.prisma.message.findFirst.mockResolvedValue({
      content: "What comps support this pricing?",
    });

    const result = await createTrajectoryLogFromRun({
      runId: "run-3",
      orgId: "org-1",
      userId: "user-1",
      conversationId: "conversation-3",
      status: "succeeded",
    });

    expect(result.taskInput).toBe("What comps support this pricing?");
    expect(dbMock.prisma.message.findFirst).toHaveBeenCalledWith({
      where: {
        conversationId: "conversation-3",
        role: "user",
        conversation: {
          orgId: "org-1",
        },
      },
      orderBy: { createdAt: "desc" },
      select: { content: true },
    });
  });
});
