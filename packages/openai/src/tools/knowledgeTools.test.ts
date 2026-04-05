import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@openai/agents", () => ({
  tool: <T extends object>(definition: T) => definition,
}));

vi.mock("./memoryTools", () => ({
  buildMemoryToolHeaders: () => ({}),
}));

import { search_knowledge_base } from "./knowledgeTools";

const searchKnowledgeExecute = (
  search_knowledge_base as unknown as {
    execute: (input: {
      query: string;
      content_types?: string[] | null;
      limit?: number | null;
      deal_context?: {
        parish?: string | null;
        sku_type?: string | null;
        deal_status?: string | null;
      } | null;
      recency_weight?: "none" | "moderate" | "strong" | null;
    }) => Promise<string>;
  }
).execute;

describe("knowledgeTools parish filtering", () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const originalVercelUrl = process.env.VERCEL_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    delete process.env.VERCEL_URL;
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    if (originalAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    }
    if (originalVercelUrl === undefined) {
      delete process.env.VERCEL_URL;
    } else {
      process.env.VERCEL_URL = originalVercelUrl;
    }
    vi.restoreAllMocks();
  });

  it("filters out non-matching parish records for parish-scoped queries", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              sourceId: "ebr-source",
              contentText: "East Baton Rouge for-sale listings",
              metadata: { parish: "East Baton Rouge" },
            },
            {
              sourceId: "livingston-source",
              contentText: "Livingston Parish screening workflow",
              metadata: { parish: "Livingston" },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const output = await searchKnowledgeExecute({
      query: "identify land parcels in Livingston Parish where i can develop a mobile home park",
      limit: 5,
    });
    const parsed = JSON.parse(output) as Array<{ sourceId?: string }>;

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.sourceId).toBe("livingston-source");
  });
});
