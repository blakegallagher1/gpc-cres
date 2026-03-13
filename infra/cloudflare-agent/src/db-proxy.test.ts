import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  connectMock,
  queryMock,
  endMock,
  clientConstructorMock,
} = vi.hoisted(() => {
  const connect = vi.fn();
  const query = vi.fn();
  const end = vi.fn();
  const clientConstructor = vi.fn(function MockPgClient() {
    return {
      connect,
      query,
      end,
    };
  });

  return {
    connectMock: connect,
    queryMock: query,
    endMock: end,
    clientConstructorMock: clientConstructor,
  };
});

vi.mock("pg", () => ({
  default: {
    Client: clientConstructorMock,
  },
}));

import { handleDbProxy } from "./db-proxy";

const env = {
  LOCAL_API_KEY: "gateway-key",
  HYPERDRIVE: {
    connectionString: "postgresql://proxy.test/entitlement_os",
  },
} as const;

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("https://agents.gallagherpropco.com/db", {
    method: "POST",
    headers: {
      Authorization: "Bearer gateway-key",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("handleDbProxy", () => {
  beforeEach(() => {
    connectMock.mockReset();
    queryMock.mockReset();
    endMock.mockReset();
    clientConstructorMock.mockClear();
  });

  it("returns JSON 500 when a one-shot query client cannot connect", async () => {
    connectMock.mockRejectedValueOnce(new Error("hyperdrive connect failed"));

    const response = await handleDbProxy(makeRequest({ sql: "SELECT 1", args: [] }), env as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Database error",
      detail: "hyperdrive connect failed",
    });
    expect(endMock).toHaveBeenCalledTimes(1);
  });

  it("returns JSON 500 when BEGIN fails during transaction startup", async () => {
    connectMock.mockResolvedValueOnce(undefined);
    queryMock.mockRejectedValueOnce(new Error("begin failed"));

    const response = await handleDbProxy(makeRequest({ action: "begin" }), env as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Database error",
      detail: "begin failed",
    });
    expect(endMock).toHaveBeenCalledTimes(1);
  });
});
