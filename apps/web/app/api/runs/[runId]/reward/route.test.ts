import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  runFindFirstMock,
  addRewardSignalMock,
  queryRawUnsafeMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  runFindFirstMock: vi.fn(),
  addRewardSignalMock: vi.fn(),
  queryRawUnsafeMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    run: {
      findFirst: runFindFirstMock,
    },
    $queryRawUnsafe: queryRawUnsafeMock,
  },
}));

vi.mock("@/lib/agent/reward.service", () => ({
  addRewardSignal: addRewardSignalMock,
}));

import { POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "run-1";

describe("POST /api/runs/[runId]/reward", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    runFindFirstMock.mockReset();
    queryRawUnsafeMock.mockReset();
    addRewardSignalMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/runs/${RUN_ID}/reward`, {
      method: "POST",
      body: JSON.stringify({ userScore: 4 }),
    });
    const res = await POST(req, { params: Promise.resolve({ runId: RUN_ID }) });
    const payload = await res.json();

    expect(res.status).toBe(401);
    expect(payload).toEqual({ error: "Unauthorized" });
  });

  it("validates payload and returns 400", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    runFindFirstMock.mockResolvedValue({
      id: RUN_ID,
      outputJson: { confidence: 0.9 },
    });
    queryRawUnsafeMock.mockResolvedValue([{ id: "ep-1" }]);
    addRewardSignalMock.mockResolvedValue({
      id: "reward-1",
      episodeId: "ep-1",
      userScore: 4,
      autoScore: 0.9,
      timestamp: "2026-02-15T00:00:00.000Z",
    });

    const req = new NextRequest(`http://localhost/api/runs/${RUN_ID}/reward`, {
      method: "POST",
      body: JSON.stringify({ userScore: 4.5 }),
    });
    const res = await POST(req, { params: Promise.resolve({ runId: RUN_ID }) });
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload.error).toContain("userScore");
  });

  it("persists manual reward by resolved episode id", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    runFindFirstMock.mockResolvedValue({
      id: RUN_ID,
      outputJson: { confidence: 0.75 },
    });
    queryRawUnsafeMock.mockResolvedValue([{ id: "ep-1" }]);
    addRewardSignalMock.mockResolvedValue({
      id: "reward-1",
      episodeId: "ep-1",
      userScore: 5,
      autoScore: 0.75,
      timestamp: "2026-02-15T00:00:00.000Z",
    });

    const req = new NextRequest(`http://localhost/api/runs/${RUN_ID}/reward`, {
      method: "POST",
      body: JSON.stringify({ userScore: 5, autoScore: 0.75 }),
    });
    const res = await POST(req, { params: Promise.resolve({ runId: RUN_ID }) });
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(addRewardSignalMock).toHaveBeenCalledWith("ep-1", 5, 0.75);
    expect(payload.reward.episodeId).toBe("ep-1");
  });
});
