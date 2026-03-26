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
});

