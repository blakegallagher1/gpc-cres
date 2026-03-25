import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { executeTool } from "./tool-router";
import type { Env } from "./types";

describe("tool-router gateway Access header propagation", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function baseEnv(): Env {
    return {
      AGENT_CHAT: {} as DurableObjectNamespace,
      CODEX_RELAY: {} as DurableObjectNamespace,
      HYPERDRIVE: {} as Hyperdrive,
      OPENAI_API_KEY: "openai-key",
      LOCAL_API_KEY: "gateway-key",
      LOCAL_API_URL: "https://api.gallagherpropco.com",
      VERCEL_URL: "https://gallagherpropco.com",
      CODEX_APP_SERVER_URL: "wss://codex.gallagherpropco.com",
    };
  }

  it("adds Access headers for gateway tools when env values are present", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const env: Env = {
      ...baseEnv(),
      CF_ACCESS_CLIENT_ID: "client-id.access",
      CF_ACCESS_CLIENT_SECRET: "client-secret",
    };

    await executeTool(env, "query_property_db_sql", '{"sql":"SELECT 1"}', "user-token", {
      conversationId: "conv-1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;

    expect(headers["CF-Access-Client-Id"]).toBe("client-id.access");
    expect(headers["CF-Access-Client-Secret"]).toBe("client-secret");
  });

  it("omits Access headers for gateway tools when env values are absent", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const env = baseEnv();

    await executeTool(env, "query_property_db_sql", '{"sql":"SELECT 1"}', "user-token", {
      conversationId: "conv-1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;

    expect(headers["CF-Access-Client-Id"]).toBeUndefined();
    expect(headers["CF-Access-Client-Secret"]).toBeUndefined();
  });
});
