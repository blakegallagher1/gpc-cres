import { describe, expect, it, vi, beforeEach } from "vitest";

const { chatSessionMock, prismaChatSessionCreateMock } = vi.hoisted(() => {
  const chatSession = {
    getConversationId: vi.fn(() => "conversation-id"),
    runCompaction: vi.fn().mockResolvedValue(undefined),
    getItems: vi.fn().mockResolvedValue([]),
    addItems: vi.fn().mockResolvedValue([]),
  };

  return {
    chatSessionMock: chatSession,
    prismaChatSessionCreateMock: vi.fn().mockResolvedValue(chatSession),
  };
});

vi.mock("@entitlement-os/db", () => ({
  isDatabaseConnectivityError: (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error ?? "");
    const lowered = message.toLowerCase();
    return (
      lowered.includes("gateway db proxy error") ||
      lowered.includes("prismaclientinitializationerror") ||
      lowered.includes("can't reach database server") ||
      lowered.includes("cant reach database server") ||
      lowered.includes("could not connect to server") ||
      lowered.includes("connect etimedout") ||
      lowered.includes("econnreset") ||
      lowered.includes("origin database does not support ssl") ||
      lowered.includes("connect econnrefused") ||
      lowered.includes("connection terminated unexpectedly") ||
      lowered.includes("database error")
    );
  },
  prisma: {
    run: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    conversation: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    message: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    orgMembership: {
      findMany: vi.fn(),
    },
    jurisdiction: {
      findFirst: vi.fn(),
    },
    deal: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("../executeAgent", () => ({
  executeAgentWorkflow: vi.fn(),
  toDatabaseRunId: (runId: string) => `uuid-${runId}`,
}));

vi.mock("@gpc/server/workflows/temporal-client", () => ({
  getTemporalClient: vi.fn(),
}));

vi.mock("@gpc/server/chat/chat-session.service", () => ({
  PrismaChatSession: {
    create: prismaChatSessionCreateMock,
  },
}));

vi.mock("@gpc/server/services/preference.service", () => ({
  buildPreferenceContext: vi.fn().mockResolvedValue(""),
}));

const {
  buildBusinessMemoryContextMock,
  captureBusinessChatMemoryMock,
} = vi.hoisted(() => ({
  buildBusinessMemoryContextMock: vi.fn().mockResolvedValue({
    contextBlock: "",
    results: [],
    retrievalMode: null,
  }),
  captureBusinessChatMemoryMock: vi.fn().mockResolvedValue({
    captured: true,
    sourceId: "chat-message:msg-1",
    ingestedIds: ["knowledge-1"],
    sanitizedText: "Assess parcel entitlement path",
    businessDomains: ["entitlement"],
    captureKind: "fact",
  }),
}));

vi.mock("@gpc/server/services/business-memory.service", () => ({
  buildBusinessMemoryContext: buildBusinessMemoryContextMock,
  captureBusinessChatMemory: captureBusinessChatMemoryMock,
}));

import { getTemporalClient } from "@gpc/server/workflows/temporal-client";
import { prisma } from "@entitlement-os/db";
import { executeAgentWorkflow } from "../executeAgent";
import { isDatabaseConnectivityError, runAgentWorkflow } from "../agentRunner";

const BASE_REQUEST = {
  orgId: "org-stability",
  userId: "user-stability",
  message: "Assess parcel entitlement path",
  runType: "ENRICHMENT",
  correlationId: "shared-stability-run",
  persistConversation: false,
};

function configureClaimReplayState(params: {
  openaiResponseId: string | null;
  startedAt: Date;
}) {
  let lookupCount = 0;
  prisma.run.findUnique = vi.fn(async (query: { select?: { startedAt?: unknown } }) => {
    if (query.select?.startedAt) {
      return {
        status: "running",
        outputJson: null,
        inputHash: "input-hash",
        openaiResponseId: params.openaiResponseId,
        startedAt: params.startedAt,
      };
    }

    lookupCount += 1;
    if (lookupCount === 1) {
      return {
        status: "running",
        outputJson: null,
        inputHash: "input-hash",
        openaiResponseId: null,
        startedAt: new Date(),
      };
    }

    if (lookupCount === 3) {
      return {
        status: "running",
        outputJson: null,
        inputHash: "input-hash",
        openaiResponseId: params.openaiResponseId,
        startedAt: params.startedAt,
      };
    }

    return null;
  });
}

function makeWorkflowResult(runId: string) {
  return {
    runId,
    status: "succeeded",
    finalOutput: "ok",
    finalReport: null,
    toolsInvoked: [],
    trust: {
      toolsInvoked: [],
      packVersionsUsed: [],
      evidenceCitations: [],
      evidenceHash: null,
      confidence: 0.96,
      missingEvidence: [],
      verificationSteps: [],
      lastAgentName: "coordinator",
      errorSummary: null,
      durationMs: 11,
      toolFailures: [],
      proofChecks: [],
      retryAttempts: 0,
      retryMaxAttempts: 0,
      retryMode: "local",
      fallbackLineage: ["local-fallback"],
      fallbackReason: "forced local fallback",
    },
    openaiResponseId: "openai-response-id",
    inputHash: "input-hash",
  };
}

function setTemporalUnavailable() {
  (getTemporalClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    workflow: {
      start: vi
        .fn()
        .mockRejectedValue(new Error("Temporal start failed")),
      getHandle: vi
        .fn()
        .mockResolvedValue({
          describe: vi
            .fn()
            .mockRejectedValue(new Error("no existing temporal handle")),
        }),
    },
  });
}

describe("runAgentWorkflow local fallback resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENABLE_TEMPORAL = "true";
    process.env.TEMPORAL_ADDRESS = "http://temporal.local:7233";
    setTemporalUnavailable();

    chatSessionMock.getConversationId.mockReturnValue("conversation-id");
    chatSessionMock.runCompaction.mockResolvedValue(undefined);
    chatSessionMock.getItems.mockResolvedValue([]);
    chatSessionMock.addItems.mockResolvedValue([]);
    prisma.message.findMany.mockResolvedValue([]);

    (executeAgentWorkflow as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeWorkflowResult(`agent-run-${BASE_REQUEST.correlationId}`),
    );
  });

  it("allows stale lease recovery on explicit duplicate local-fallback collisions", async () => {
    const staleRunRecord = {
      openaiResponseId: "stale-lease-token",
      startedAt: new Date(Date.now() - 20 * 60 * 1000),
    };

    configureClaimReplayState(staleRunRecord);

    prisma.run.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await runAgentWorkflow(BASE_REQUEST);
    await runAgentWorkflow(BASE_REQUEST);

    expect((executeAgentWorkflow as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  it("rejects fresh duplicate local-fallback attempts when lease is still alive", async () => {
    const activeFreshRun = {
      openaiResponseId: "active-lease-token",
      startedAt: new Date(Date.now() - 30 * 1000),
    };

    configureClaimReplayState(activeFreshRun);

    prisma.run.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });

    await runAgentWorkflow(BASE_REQUEST);

    await expect(runAgentWorkflow(BASE_REQUEST)).rejects.toThrow(
      "Local run lease unavailable for agent-run-shared-stability-run.",
    );

    expect((executeAgentWorkflow as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("uses org-scoped conversation lookup on happy path when conversationId is provided", async () => {
    delete process.env.ENABLE_TEMPORAL;
    delete process.env.TEMPORAL_ADDRESS;
    prisma.conversation.findFirst.mockResolvedValue({ id: "conv-1" });
    prisma.message.findMany.mockResolvedValue([]);
    prisma.run.upsert.mockResolvedValue({ id: "run-1", status: "running" });
    prisma.run.update.mockResolvedValue({ id: "run-1", status: "succeeded" });

    await runAgentWorkflow({
      ...BASE_REQUEST,
      correlationId: "org-scoped-conversation-lookup",
      conversationId: "conv-1",
      persistConversation: false,
    });

    expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
      where: { id: "conv-1", orgId: "org-stability" },
      select: { id: true },
    });
  });

  it("rejects cross-tenant conversation IDs when membership scope does not match", async () => {
    delete process.env.ENABLE_TEMPORAL;
    delete process.env.TEMPORAL_ADDRESS;
    prisma.conversation.findFirst.mockResolvedValue(null);

    await expect(
      runAgentWorkflow({
        ...BASE_REQUEST,
        correlationId: "cross-tenant-conversation",
        conversationId: "foreign-conversation",
        persistConversation: false,
      }),
    ).rejects.toThrow("Conversation not found");
  });

  it("skips fallback history query when persistConversation=false and no conversationId", async () => {
    delete process.env.ENABLE_TEMPORAL;
    delete process.env.TEMPORAL_ADDRESS;
    prisma.conversation.findFirst.mockReset();
    prisma.message.findMany.mockResolvedValue([
      {
        role: "assistant",
        content: "unexpected",
        metadata: null,
      },
    ]);
    prisma.run.upsert.mockResolvedValue({ id: "run-2", status: "running" });
    prisma.run.update.mockResolvedValue({ id: "run-2", status: "succeeded" });

    await runAgentWorkflow({
      ...BASE_REQUEST,
      correlationId: "no-fallback-history",
      conversationId: undefined,
      persistConversation: false,
    });

    expect(prisma.conversation.findFirst).not.toHaveBeenCalled();
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });

  it("uses the direct local path when Temporal is not explicitly enabled", async () => {
    delete process.env.ENABLE_TEMPORAL;
    process.env.TEMPORAL_ADDRESS = "http://temporal.local:7233";
    prisma.run.upsert.mockResolvedValue({ id: "run-3", status: "running" });
    prisma.run.update.mockResolvedValue({ id: "run-3", status: "succeeded" });

    await runAgentWorkflow({
      ...BASE_REQUEST,
      correlationId: "temporal-disabled-local-direct",
      persistConversation: false,
    });

    expect(getTemporalClient).not.toHaveBeenCalled();
    expect((executeAgentWorkflow as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("injects historical business memory and captures persisted user chat messages", async () => {
    delete process.env.ENABLE_TEMPORAL;
    delete process.env.TEMPORAL_ADDRESS;

    chatSessionMock.addItems.mockResolvedValue([
      {
        id: "msg-1",
        conversationId: "conversation-id",
        role: "user",
        content: "Assess parcel entitlement path",
        metadata: { kind: "chat_user_message" },
        createdAt: new Date("2026-03-16T18:00:00.000Z"),
      },
    ]);
    buildBusinessMemoryContextMock.mockResolvedValue({
      contextBlock:
        "[Historical business memory from prior user chats]\n- 2026-03-16 | kind=preference | domains=strategy | user-authored note: Focus on the broader business operating system.",
      results: [],
      retrievalMode: "semantic",
    });
    prisma.run.upsert.mockResolvedValue({ id: "run-4", status: "running" });
    prisma.run.update.mockResolvedValue({ id: "run-4", status: "succeeded" });

    const workflow = await runAgentWorkflow({
      ...BASE_REQUEST,
      correlationId: "business-memory-capture",
      persistConversation: true,
    });

    expect(buildBusinessMemoryContextMock).toHaveBeenCalledWith({
      orgId: "org-stability",
      userId: "user-stability",
      userMessage: "Assess parcel entitlement path",
      conversationId: "conversation-id",
      dealId: null,
    });
    expect(captureBusinessChatMemoryMock).toHaveBeenCalledWith({
      orgId: "org-stability",
      userId: "user-stability",
      messageId: "msg-1",
      messageText: "Assess parcel entitlement path",
      conversationId: "conversation-id",
      dealId: null,
      createdAt: new Date("2026-03-16T18:00:00.000Z"),
    });
    expect(workflow.agentInput[0].content).toContain(
      "[Historical business memory from prior user chats]",
    );
  });

  it("treats Prisma can't-reach-server failures as connectivity errors", () => {
    expect(
      isDatabaseConnectivityError(
        new Error(
          "Invalid `prisma.userPreference.findMany()` invocation:\n\nCan't reach database server at `localhost:54321`.",
        ),
      ),
    ).toBe(true);
  });
});
