import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@openai/agents", () => ({
  tool: <T>(definition: T) => definition,
}));

describe("browser_task preferred model routing", () => {
  const originalApiKey = process.env.LOCAL_API_KEY;
  const originalCuaUrl = process.env.CUA_WORKER_URL;
  const originalDefaultModel = process.env.CUA_DEFAULT_MODEL;

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    process.env.LOCAL_API_KEY = "local-api-key";
    process.env.CUA_WORKER_URL = "https://cua.example.com";
    process.env.CUA_DEFAULT_MODEL = "gpt-5.4";
  });

  it("uses the request-scoped preferred model when the tool input model is null", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "worker unavailable",
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { browser_task } = await import("./browserTools.js");
    const result = await browser_task.execute(
      {
        url: "https://example.com",
        instructions: "Read the heading.",
        model: null,
      },
      {
        context: {
          preferredCuaModel: "gpt-5.4-mini",
        },
      },
    );

    expect(result).toMatchObject({
      success: false,
      modeUsed: "gpt-5.4-mini",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      model: string;
    };
    expect(requestBody.model).toBe("gpt-5.4-mini");
  });

  it("prefers an explicit tool model over the request-scoped preference", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "worker unavailable",
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { browser_task } = await import("./browserTools.js");
    await browser_task.execute(
      {
        url: "https://example.com",
        instructions: "Read the heading.",
        model: "gpt-5.4",
      },
      {
        context: {
          preferredCuaModel: "gpt-5.4-mini",
        },
      },
    );

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      model: string;
    };
    expect(requestBody.model).toBe("gpt-5.4");
  });

  it("marks 404 task-create failures as service unavailability and suggests public web recovery", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => '{"detail":"Not Found"}',
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { browser_task } = await import("./browserTools.js");
    const result = await browser_task.execute(
      {
        url: "https://www.loopnet.com/search/commercial-real-estate/baton-rouge-la-70808/for-lease/",
        instructions: "Gather lease listings.",
        model: null,
      },
      {
        context: {
          preferredCuaModel: "gpt-5.4-mini",
        },
      },
    );

    expect(result).toMatchObject({
      success: false,
      modeUsed: "gpt-5.4-mini",
      serviceUnavailable: true,
      suggestedLane: "public_web",
    });
    expect(String(result._hint)).toContain("switch to Perplexity web research");
  });

  it("falls back to the gateway proxy when the dedicated cua host returns 404", async () => {
    process.env.CUA_WORKER_URL = "https://cua.gallagherpropco.com";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => '{"detail":"Not Found"}',
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ taskId: "task-123" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "completed",
          result: {
            success: true,
            data: { finalMessage: "Example Domain" },
            source: { url: "https://example.com" },
            screenshots: [],
            turns: 1,
            cost: { inputTokens: 1, outputTokens: 1 },
            modeUsed: "native",
            finalMessage: "Example Domain",
          },
        }),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { browser_task } = await import("./browserTools.js");
    const result = await browser_task.execute(
      {
        url: "https://example.com",
        instructions: "Read the heading.",
        model: null,
      },
      {
        context: {
          preferredCuaModel: "gpt-5.4-mini",
        },
      },
    );

    expect(result).toMatchObject({
      success: true,
      finalMessage: "Example Domain",
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://cua.gallagherpropco.com/tasks");
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("https://gateway.gallagherpropco.com/tasks");
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe("https://gateway.gallagherpropco.com/tasks/task-123");
  });
});
