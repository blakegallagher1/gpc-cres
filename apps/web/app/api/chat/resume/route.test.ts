import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, resumeSerializedAgentRunMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  resumeSerializedAgentRunMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/agent/executeAgent", () => ({
  resumeSerializedAgentRun: resumeSerializedAgentRunMock,
}));

import { POST } from "./route";

describe("POST /api/chat/resume", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    resumeSerializedAgentRunMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/chat/resume", {
      method: "POST",
      body: JSON.stringify({ runId: "run-1" }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(resumeSerializedAgentRunMock).not.toHaveBeenCalled();
  });

  it("returns 400 when runId is missing", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });

    const req = new NextRequest("http://localhost/api/chat/resume", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("runId is required");
    expect(resumeSerializedAgentRunMock).not.toHaveBeenCalled();
  });

  it("returns resumed run details and emitted events", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    resumeSerializedAgentRunMock.mockImplementation(
      async (params: { onEvent?: (event: Record<string, unknown>) => void }) => {
        params.onEvent?.({
          type: "tool_end",
          name: "search_parcels",
          status: "completed",
        });
        return {
          runId: "run-1",
          status: "succeeded",
        };
      },
    );

    const req = new NextRequest("http://localhost/api/chat/resume", {
      method: "POST",
      body: JSON.stringify({ runId: "run-1" }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      runId: "run-1",
      status: "succeeded",
      events: [
        {
          type: "tool_end",
          name: "search_parcels",
          status: "completed",
        },
      ],
    });
    expect(resumeSerializedAgentRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "11111111-1111-4111-8111-111111111111",
        userId: "99999999-9999-4999-8999-999999999999",
        runId: "run-1",
      }),
    );
  });
});
