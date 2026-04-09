import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  launchBrowserSessionMock,
  runNativeComputerLoopMock,
} = vi.hoisted(() => {
  process.env.CUA_WORKER_DISABLE_AUTOSTART = "true";
  process.env.API_KEY = "test-api-key";
  process.env.OPENAI_API_KEY = "sk-test";
  process.env.LOG_LEVEL = "silent";

  return {
    launchBrowserSessionMock: vi.fn(),
    runNativeComputerLoopMock: vi.fn(),
  };
});

vi.mock("../src/browser-session.js", () => ({
  launchBrowserSession: launchBrowserSessionMock,
}));

vi.mock("../src/responses-loop.js", () => ({
  runNativeComputerLoop: runNativeComputerLoopMock,
  runCodeMode: vi.fn(),
}));

describe("cua worker server", () => {
  beforeEach(() => {
    launchBrowserSessionMock.mockReset();
    runNativeComputerLoopMock.mockReset();
  });

  it("serves health checks without auth", async () => {
    const { createServer } = await import("../src/server.js");
    const app = await createServer();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok", browser: "ready" });
    } finally {
      await app.close();
    }
  });

  it("requires bearer auth for task creation and persists task metadata", async () => {
    const session = {
      page: {},
      captureScreenshot: vi.fn(),
      readState: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    launchBrowserSessionMock.mockResolvedValue(session);
    runNativeComputerLoopMock.mockResolvedValue({
      success: true,
      data: { headline: "done" },
      screenshots: [],
      turns: 1,
      modeUsed: "native",
      cost: { inputTokens: 3, outputTokens: 2 },
      source: {
        url: "https://example.com",
        fetchedAt: "2026-04-09T00:00:00.000Z",
      },
    });

    const { createServer } = await import("../src/server.js");
    const app = await createServer();

    try {
      const unauthorized = await app.inject({
        method: "POST",
        url: "/tasks",
        payload: {
          url: "https://example.com",
          instructions: "Find the zoning code",
          model: "gpt-5.4-mini",
        },
      });
      expect(unauthorized.statusCode).toBe(401);

      const createResponse = await app.inject({
        method: "POST",
        url: "/tasks",
        headers: {
          authorization: "Bearer test-api-key",
        },
        payload: {
          url: "https://example.com",
          instructions: "Find the zoning code",
          model: "gpt-5.4-mini",
        },
      });

      expect(createResponse.statusCode).toBe(202);
      const created = createResponse.json();
      expect(created.taskId).toEqual(expect.any(String));

      const statusResponse = await app.inject({
        method: "GET",
        url: `/tasks/${created.taskId}`,
      });
      expect(statusResponse.statusCode).toBe(200);
      expect(statusResponse.json()).toMatchObject({
        id: created.taskId,
        request: {
          url: "https://example.com",
          instructions: "Find the zoning code",
          model: "gpt-5.4-mini",
        },
      });
    } finally {
      await app.close();
    }
  });
});
