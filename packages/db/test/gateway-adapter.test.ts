import { afterEach, describe, expect, it, vi } from "vitest";
import { createGatewayAdapterFactory, type GatewayTarget } from "../src/gateway-adapter.js";

const QUERY_RESULT = {
  columnNames: ["ok"],
  columnTypes: [23],
  rows: [[1]],
  rowCount: 1,
};

const TX_BEGIN_RESULT = {
  columnNames: [],
  columnTypes: [],
  rows: [],
  rowCount: 0,
  txId: "tx-1",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildTargets(): GatewayTarget[] {
  return [
    { baseUrl: "https://proxy.example", apiKey: "proxy-key", name: "gateway-proxy" },
    { baseUrl: "https://direct.example", apiKey: "direct-key", name: "gateway-direct" },
  ];
}

describe("packages/db gateway adapter failover", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CF_ACCESS_CLIENT_ID;
    delete process.env.CF_ACCESS_CLIENT_SECRET;
  });

  it("falls back to the next target when the primary target rejects the request", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "unauthorized" }, 401))
      .mockResolvedValueOnce(jsonResponse(QUERY_RESULT));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = await createGatewayAdapterFactory(buildTargets()).connect();
    const result = await adapter.queryRaw({ sql: "select 1 as ok", args: [], argTypes: [] } as never);

    expect(result.rows).toEqual([[1]]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/^https:\/\/proxy\.example\/db\?_t=/),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer proxy-key" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/^https:\/\/direct\.example\/db\?_t=/),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer direct-key" }),
      }),
    );
  });

  it("pins transaction queries and commit calls to the target that began the transaction", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(TX_BEGIN_RESULT))
      .mockResolvedValueOnce(jsonResponse(QUERY_RESULT))
      .mockResolvedValueOnce(jsonResponse({ columnNames: [], columnTypes: [], rows: [], rowCount: 0 }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = await createGatewayAdapterFactory(buildTargets()).connect();
    const transaction = await adapter.startTransaction();

    await transaction.queryRaw({ sql: "select 1 as ok", args: [], argTypes: [] } as never);
    await transaction.commit();

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toHaveLength(3);
    expect(urls.every((url) => url.startsWith("https://proxy.example/db?_t="))).toBe(true);
  });
});
