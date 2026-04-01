import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types";

function makeEnv(): Env {
  return {
    UPSTREAM_GATEWAY_URL: "https://api.gallagherpropco.com",
    GATEWAY_PROXY_TOKEN: "proxy-token",
    LOCAL_API_KEY: "local-api-key",
    CF_ACCESS_CLIENT_ID: "cf-client-id",
    CF_ACCESS_CLIENT_SECRET: "cf-client-secret",
  };
}

function makeCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    props: {},
  };
}

describe("gateway proxy cua passthrough", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("passes POST /tasks straight through to the upstream gateway", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          taskId: "task-123",
          statusUrl: "/tasks/task-123",
          eventStreamUrl: "/tasks/task-123/events",
        }),
        {
          status: 202,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://gateway.gallagherpropco.com/tasks", {
        method: "POST",
        headers: {
          Authorization: "Bearer proxy-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: "https://example.com" }),
      }),
      makeEnv(),
      makeCtx(),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.gallagherpropco.com/tasks",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      taskId: "task-123",
      statusUrl: "/tasks/task-123",
    });
  });

  it("passes GET /tasks/:id straight through to the upstream gateway", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "completed",
          result: {
            success: true,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://gateway.gallagherpropco.com/tasks/task-123", {
        method: "GET",
        headers: {
          Authorization: "Bearer local-api-key",
        },
      }),
      makeEnv(),
      makeCtx(),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.gallagherpropco.com/tasks/task-123",
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "completed",
    });
  });
});
