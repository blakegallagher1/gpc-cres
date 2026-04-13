import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any imports that depend on them.
// ---------------------------------------------------------------------------

const {
  runFindFirstMock,
  messageFindFirstMock,
  trajectoryLogUpsertMock,
  trajectoryLogFindFirstMock,
  episodicEntryUpsertMock,
  episodicEntryFindFirstMock,
  episodicEntryFindManyMock,
  proceduralSkillUpsertMock,
} = vi.hoisted(() => ({
  runFindFirstMock: vi.fn(),
  messageFindFirstMock: vi.fn(),
  trajectoryLogUpsertMock: vi.fn(),
  trajectoryLogFindFirstMock: vi.fn(),
  episodicEntryUpsertMock: vi.fn(),
  episodicEntryFindFirstMock: vi.fn(),
  episodicEntryFindManyMock: vi.fn(),
  proceduralSkillUpsertMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    run: { findFirst: runFindFirstMock },
    message: { findFirst: messageFindFirstMock },
    trajectoryLog: {
      upsert: trajectoryLogUpsertMock,
      findFirst: trajectoryLogFindFirstMock,
    },
    episodicEntry: {
      upsert: episodicEntryUpsertMock,
      findFirst: episodicEntryFindFirstMock,
      findMany: episodicEntryFindManyMock,
    },
    proceduralSkill: { upsert: proceduralSkillUpsertMock },
  },
  // Prisma namespace re-exports (needed for type-only imports)
  Prisma: {},
}));

// Mock the sub-services to isolate agent-learning.service
const { ingestKnowledgeMock, deleteKnowledgeMock } = vi.hoisted(() => ({
  ingestKnowledgeMock: vi.fn().mockResolvedValue(["kb-id-1"]),
  deleteKnowledgeMock: vi.fn().mockResolvedValue(0),
}));

vi.mock("../search/knowledge-base.service", () => ({
  ingestKnowledge: ingestKnowledgeMock,
  deleteKnowledge: deleteKnowledgeMock,
}));

vi.mock("@entitlement-os/shared/crypto", () => ({
  hashJsonSha256: (value: unknown) =>
    `hash:${JSON.stringify(value).slice(0, 16)}`,
}));

vi.mock("@entitlement-os/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@entitlement-os/shared")>();
  return {
    ...actual,
    AGENT_RUN_STATE_KEYS: {
      lastAgentName: "lastAgentName",
      retrievalContext: "retrievalContext",
    },
  };
});

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { AUTOMATION_CONFIG } from "../automation/config";
import { promoteRunToLongTermMemory } from "./agent-learning.service";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const TRAJ_ID = "44444444-4444-4444-8444-444444444444";
const EPISODE_ID = "55555555-5555-4555-8555-555555555555";
const SKILL_ID = "66666666-6666-4666-8666-666666666666";

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    dealId: null,
    jurisdictionId: null,
    outputJson: {
      lastAgentName: "Coordinator",
      finalOutput: "Task completed successfully.",
      toolsInvoked: ["search_parcels", "get_parcel"],
      confidence: 0.85,
      usage: { totalTokens: 1200, costUsd: 0.002 },
    },
    trajectory: null,
    ...overrides,
  };
}

function makeTrajectoryLog(overrides: Record<string, unknown> = {}) {
  return {
    id: TRAJ_ID,
    finalOutput: "Task completed successfully.",
    toolCalls: ["search_parcels", "get_parcel"],
    trustJson: { confidence: 0.85 },
    evidenceCitations: [],
    retrievedContextSummary: null,
    ...overrides,
  };
}

function makeEpisodicEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: EPISODE_ID,
    taskType: "ENRICHMENT",
    agentId: "Coordinator",
    toolSequence: ["search_parcels", "get_parcel"],
    summary: "Test summary",
    outcome: "SUCCESS",
    confidence: 0.85,
    metadata: { evidenceCount: 0 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("promoteRunToLongTermMemory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runFindFirstMock.mockResolvedValue(makeRun());
    messageFindFirstMock.mockResolvedValue({ content: "What is the status?" });
    trajectoryLogUpsertMock.mockResolvedValue({ id: TRAJ_ID });
    trajectoryLogFindFirstMock.mockResolvedValue(makeTrajectoryLog());
    episodicEntryUpsertMock.mockResolvedValue({ id: EPISODE_ID });
    episodicEntryFindFirstMock.mockResolvedValue(makeEpisodicEntry());
    // Return fewer than minEpisodesForSkill to avoid procedural skill creation
    // by default (keeps tests focused).
    episodicEntryFindManyMock.mockResolvedValue([makeEpisodicEntry()]);
    proceduralSkillUpsertMock.mockResolvedValue({ id: SKILL_ID });
  });

  it("successful run creates TrajectoryLog and EpisodicEntry when config flags are on", async () => {
    // Confirm config flags are on (they are in the frozen default config)
    expect(AUTOMATION_CONFIG.agentLearning.createTrajectoryLogs).toBe(true);
    expect(AUTOMATION_CONFIG.agentLearning.createEpisodes).toBe(true);

    const result = await promoteRunToLongTermMemory({
      runId: RUN_ID,
      orgId: ORG_ID,
      userId: USER_ID,
      status: "succeeded",
    });

    // TrajectoryLog should have been created
    expect(trajectoryLogUpsertMock).toHaveBeenCalledOnce();
    expect(result.trajectoryLogId).toBe(TRAJ_ID);

    // EpisodicEntry should have been created (requires trajectoryLog.findFirst)
    expect(trajectoryLogFindFirstMock).toHaveBeenCalledOnce();
    expect(episodicEntryUpsertMock).toHaveBeenCalledOnce();
    expect(result.episodicEntryId).toBe(EPISODE_ID);
  });

  it("failed run creates TrajectoryLog but also creates EpisodicEntry with FAILURE outcome", async () => {
    // The pipeline does not skip episode creation for failed runs — it creates
    // an episode with outcome = "FAILURE" for learning from failures.
    const result = await promoteRunToLongTermMemory({
      runId: RUN_ID,
      orgId: ORG_ID,
      userId: USER_ID,
      status: "failed",
    });

    expect(trajectoryLogUpsertMock).toHaveBeenCalledOnce();
    expect(result.trajectoryLogId).toBe(TRAJ_ID);
    // Episode creation is still called for failed runs
    expect(episodicEntryUpsertMock).toHaveBeenCalledOnce();
    expect(result.episodicEntryId).toBe(EPISODE_ID);
  });

  it("detects repeated tool patterns — upserts ProceduralSkill when minEpisodes threshold met", async () => {
    const minEpisodes = AUTOMATION_CONFIG.agentLearning.minEpisodesForSkill;
    // Provide enough successful episodes that all share the same tool sequence
    const successfulEpisodes = Array.from({ length: minEpisodes }, (_, i) =>
      makeEpisodicEntry({ id: `ep-${i}`, outcome: "SUCCESS" }),
    );
    episodicEntryFindManyMock.mockResolvedValue(successfulEpisodes);
    proceduralSkillUpsertMock.mockResolvedValue({ id: SKILL_ID });

    const result = await promoteRunToLongTermMemory({
      runId: RUN_ID,
      orgId: ORG_ID,
      userId: USER_ID,
      status: "succeeded",
    });

    expect(proceduralSkillUpsertMock).toHaveBeenCalledOnce();
    expect(result.updatedSkillCount).toBe(1);
  });

  it("AbortSignal timeout — promotion aborts cleanly without calling downstream services", async () => {
    const controller = new AbortController();
    controller.abort(); // abort immediately

    await expect(
      promoteRunToLongTermMemory({
        runId: RUN_ID,
        orgId: ORG_ID,
        userId: USER_ID,
        status: "succeeded",
        signal: controller.signal,
      }),
    ).rejects.toThrow("aborted");

    // No DB writes should have occurred
    expect(trajectoryLogUpsertMock).not.toHaveBeenCalled();
    expect(episodicEntryUpsertMock).not.toHaveBeenCalled();
  });
});
