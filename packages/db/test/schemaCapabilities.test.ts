import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockQueryRawUnsafe } = vi.hoisted(() => ({
  mockQueryRawUnsafe: vi.fn(),
}));

vi.mock("../src/client.js", () => ({
  prisma: {
    $queryRawUnsafe: mockQueryRawUnsafe,
  },
}));

describe("getDataAgentSchemaCapabilities", () => {
  beforeEach(() => {
    mockQueryRawUnsafe.mockReset();
    vi.resetModules();
    delete process.env.DATABASE_URL;
    delete process.env.DIRECT_DATABASE_URL;
  });

  it("reports table availability and caches per datasource key", async () => {
    mockQueryRawUnsafe.mockResolvedValue([
      { table_name: "Episode" },
      { table_name: "KnowledgeEmbedding" },
      { table_name: "RewardSignal" },
    ]);

    const { getDataAgentSchemaCapabilities } = await import("../src/schemaCapabilities.js");

    const first = await getDataAgentSchemaCapabilities();
    const second = await getDataAgentSchemaCapabilities();

    expect(first).toEqual({
      episode: true,
      kgEvent: false,
      temporalEdge: false,
      rewardSignal: true,
      knowledgeEmbedding: true,
    });
    expect(second).toEqual(first);
    expect(mockQueryRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it("refreshes the cache when the datasource key changes", async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ table_name: "Episode" }])
      .mockResolvedValueOnce([{ table_name: "KGEvent" }]);

    const { getDataAgentSchemaCapabilities } = await import("../src/schemaCapabilities.js");

    process.env.DATABASE_URL = "postgresql://localhost/db-one";
    const first = await getDataAgentSchemaCapabilities();

    process.env.DATABASE_URL = "postgresql://localhost/db-two";
    const second = await getDataAgentSchemaCapabilities();

    expect(first.episode).toBe(true);
    expect(first.kgEvent).toBe(false);
    expect(second.episode).toBe(false);
    expect(second.kgEvent).toBe(true);
    expect(mockQueryRawUnsafe).toHaveBeenCalledTimes(2);
  });
});
