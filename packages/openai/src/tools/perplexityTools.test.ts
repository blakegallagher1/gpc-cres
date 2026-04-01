import { beforeEach, describe, expect, it, vi } from "vitest";

const { responseCreateMock } = vi.hoisted(() => ({
  responseCreateMock: vi.fn(),
}));

vi.mock("@openai/agents", () => ({
  tool: <T extends object>(definition: T) => definition,
}));

vi.mock("@perplexity-ai/perplexity_ai", () => ({
  default: class MockPerplexity {
    responses = {
      create: responseCreateMock,
    };
  },
}));

import {
  perplexity_deep_research,
  perplexity_quick_lookup,
  perplexity_structured_extract,
  perplexity_web_research,
} from "./perplexityTools.js";

const webResearchExecute = (
  perplexity_web_research as unknown as {
    execute: (input: {
      query: string;
      preset: "fast-search" | "pro-search" | "deep-research" | null;
      domain_filter: string[] | null;
      recency: "day" | "week" | "month" | "year" | null;
    }) => Promise<Record<string, unknown>>;
  }
).execute;

const structuredExtractExecute = (
  perplexity_structured_extract as unknown as {
    execute: (input: {
      query: string;
      schema_type:
        | "comparable_sales"
        | "market_metrics"
        | "permit_data"
        | "facility_inventory"
        | "regulatory_filings"
        | "custom";
      custom_schema: string | null;
      domain_filter: string[] | null;
      recency: "day" | "week" | "month" | "year" | null;
    }) => Promise<Record<string, unknown>>;
  }
).execute;

const deepResearchExecute = (
  perplexity_deep_research as unknown as {
    execute: (input: {
      query: string;
      domain_filter: string[] | null;
    }) => Promise<Record<string, unknown>>;
  }
).execute;

const quickLookupExecute = (
  perplexity_quick_lookup as unknown as {
    execute: (input: {
      query: string;
    }) => Promise<Record<string, unknown>>;
  }
).execute;

describe("perplexityTools", () => {
  const originalApiKey = process.env.PERPLEXITY_API_KEY;

  beforeEach(() => {
    responseCreateMock.mockReset();
    process.env.PERPLEXITY_API_KEY = "pplx-test-key";
  });

  it("runs web research with default preset and extracts deduplicated sources", async () => {
    responseCreateMock.mockResolvedValue({
      output_text: "Industrial demand is rising.",
      model: "openai/gpt-5.1",
      output: [
        {
          type: "search_results",
          results: [
            { title: "Report A", url: "https://example.com/a", date: "2026-01-01" },
            { title: "Report A Duplicate", url: "https://example.com/a", date: "2026-01-01" },
            { title: "Report B", url: "https://example.com/b" },
          ],
        },
      ],
      usage: {
        input_tokens: 100,
        output_tokens: 250,
        total_tokens: 350,
      },
    });

    const result = await webResearchExecute({
      query: "Recent industrial trends in Baton Rouge",
      preset: null,
      domain_filter: ["loopnet.com"],
      recency: "month",
    });

    expect(result.success).toBe(true);
    expect(result.text).toBe("Industrial demand is rising.");
    expect(result.sources).toEqual([
      { title: "Report A", url: "https://example.com/a", date: "2026-01-01" },
      { title: "Report B", url: "https://example.com/b", date: null },
    ]);
    expect(responseCreateMock).toHaveBeenCalledTimes(1);
    expect(responseCreateMock.mock.calls[0]?.[0]).toMatchObject({
      preset: "pro-search",
      input: "Recent industrial trends in Baton Rouge",
      tools: [
        {
          type: "web_search",
          filters: {
            search_domain_filter: ["loopnet.com"],
            search_recency_filter: "month",
          },
        },
        { type: "fetch_url" },
      ],
    });
  });

  it("returns validation error when custom schema is missing", async () => {
    const result = await structuredExtractExecute({
      query: "Extract permit records",
      schema_type: "custom",
      custom_schema: null,
      domain_filter: null,
      recency: null,
    });

    expect(result).toEqual({
      success: false,
      error: "custom_schema is required when schema_type is custom",
    });
    expect(responseCreateMock).not.toHaveBeenCalled();
  });

  it("returns parse_error with raw_text when JSON schema output is not valid JSON", async () => {
    responseCreateMock.mockResolvedValue({
      output_text: "not-json",
      model: "openai/gpt-5.1",
      output: [],
      usage: {},
    });

    const result = await structuredExtractExecute({
      query: "Extract market metrics",
      schema_type: "market_metrics",
      custom_schema: null,
      domain_filter: null,
      recency: null,
    });

    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.raw_text).toBe("not-json");
    expect(typeof result.parse_error).toBe("string");
  });

  it("uses advanced-deep-research preset for deep research", async () => {
    responseCreateMock.mockResolvedValue({
      output_text: "Deep analysis",
      output: [],
      usage: {},
      model: "anthropic/claude-opus-4-6",
    });

    const result = await deepResearchExecute({
      query: "Comprehensive Louisiana IOS market analysis",
      domain_filter: ["costar.com"],
    });

    expect(result.success).toBe(true);
    expect(responseCreateMock.mock.calls[0]?.[0]).toMatchObject({
      preset: "advanced-deep-research",
      tools: [
        {
          type: "web_search",
          filters: {
            search_domain_filter: ["costar.com"],
          },
        },
        { type: "fetch_url" },
      ],
    });
  });

  it("uses fast-search preset for quick lookup", async () => {
    responseCreateMock.mockResolvedValue({
      output_text: "Quick answer",
      output: [],
      usage: {},
      model: "xai/grok-4-1-fast-non-reasoning",
    });

    const result = await quickLookupExecute({
      query: "Current zoning for 123 Main St Baton Rouge",
    });

    expect(result.success).toBe(true);
    expect(responseCreateMock.mock.calls[0]?.[0]).toMatchObject({
      preset: "fast-search",
      input: "Current zoning for 123 Main St Baton Rouge",
    });
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.PERPLEXITY_API_KEY;
      return;
    }
    process.env.PERPLEXITY_API_KEY = originalApiKey;
  });
});
