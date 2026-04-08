import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  createRunRewardMock,
  RunConflictErrorMock,
  RunRouteNotFoundErrorMock,
  RunValidationErrorMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  createRunRewardMock: vi.fn(),
  RunConflictErrorMock: class RunConflictError extends Error {},
  RunRouteNotFoundErrorMock: class RunRouteNotFoundError extends Error {},
  RunValidationErrorMock: class RunValidationError extends Error {},
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server", () => ({
  createRunReward: createRunRewardMock,
  RunConflictError: RunConflictErrorMock,
  RunRouteNotFoundError: RunRouteNotFoundErrorMock,
  RunValidationError: RunValidationErrorMock,
}));

import { POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "run-1";

describe("POST /api/runs/[runId]/reward", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    createRunRewardMock.mockReset();
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
    createRunRewardMock.mockRejectedValue(
      new RunValidationErrorMock(
        "Invalid userScore. Must be an integer between 0 and 5.",
      ),
    );

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
    createRunRewardMock.mockResolvedValue({
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
    expect(createRunRewardMock).toHaveBeenCalledWith(ORG_ID, RUN_ID, {
      userScore: 5,
      autoScore: 0.75,
    });
    expect(payload.reward.episodeId).toBe("ep-1");
  });
});
