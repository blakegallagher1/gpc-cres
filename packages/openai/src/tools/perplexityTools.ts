import { tool } from "@openai/agents";
import Perplexity from "@perplexity-ai/perplexity_ai";
import { z } from "zod";

type PerplexityPreset =
  | "fast-search"
  | "pro-search"
  | "deep-research"
  | "advanced-deep-research";

type SearchRecency = "day" | "week" | "month" | "year";

type SchemaType =
  | "comparable_sales"
  | "market_metrics"
  | "permit_data"
  | "facility_inventory"
  | "regulatory_filings"
  | "custom";

type ResponseFormatJsonSchema = {
  type: "json_schema";
  json_schema: {
    name: string;
    schema: Record<string, unknown>;
  };
};

type SearchResult = {
  title?: string;
  url?: string;
  date?: string;
};

type SearchResultsOutputItem = {
  type: "search_results";
  results?: SearchResult[];
};

type GenericOutputItem = {
  type?: string;
};

type UsageCost = {
  currency?: string;
  input_cost?: number;
  output_cost?: number;
  total_cost?: number;
};

type UsageShape = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cost?: UsageCost;
};

type PerplexityResponseShape = {
  output_text?: string;
  output?: Array<SearchResultsOutputItem | GenericOutputItem>;
  model?: string;
  usage?: UsageShape;
};

type JsonSchemaDefinition = {
  name: string;
  schema: Record<string, unknown>;
};

type PerplexityToolDefinition = {
  type: "web_search" | "fetch_url";
  filters?: Record<string, unknown>;
};

const PERPLEXITY_API_TIMEOUT_MS = 120_000;

let client: InstanceType<typeof Perplexity> | null = null;

function getClient(): InstanceType<typeof Perplexity> {
  if (client) {
    return client;
  }

  const apiKey = process.env.PERPLEXITY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("PERPLEXITY_API_KEY not configured");
  }

  client = new Perplexity({ apiKey });
  return client;
}

function isSearchResultsOutputItem(
  item: SearchResultsOutputItem | GenericOutputItem,
): item is SearchResultsOutputItem {
  return item.type === "search_results";
}

function extractSources(output: PerplexityResponseShape["output"]) {
  const seen = new Set<string>();
  const sources: Array<{ title: string; url: string; date: string | null }> = [];

  if (!output) {
    return sources;
  }

  for (const item of output) {
    if (!isSearchResultsOutputItem(item)) {
      continue;
    }

    for (const result of item.results ?? []) {
      const url = (result.url ?? "").trim();
      if (!url || seen.has(url)) {
        continue;
      }

      seen.add(url);
      sources.push({
        title: (result.title ?? "Untitled source").trim() || "Untitled source",
        url,
        date: result.date ?? null,
      });
    }
  }

  return sources;
}

function buildWebTools(
  domainFilter: string[] | null,
  recency: SearchRecency | null,
  includeFetchUrl: boolean,
): PerplexityToolDefinition[] {
  const filters: Record<string, unknown> = {};
  if (domainFilter && domainFilter.length > 0) {
    filters.search_domain_filter = domainFilter.slice(0, 20);
  }
  if (recency) {
    filters.search_recency_filter = recency;
  }

  const tools: PerplexityToolDefinition[] = [];
  if (Object.keys(filters).length > 0) {
    tools.push({ type: "web_search", filters });
  } else {
    tools.push({ type: "web_search" });
  }

  if (includeFetchUrl) {
    tools.push({ type: "fetch_url" });
  }

  return tools;
}

type PerplexityRequestShape = {
  input: string;
  preset?: PerplexityPreset;
  tools?: PerplexityToolDefinition[];
  response_format?: ResponseFormatJsonSchema;
};

async function createResponse(params: PerplexityRequestShape): Promise<PerplexityResponseShape> {
  const localClient = getClient();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PERPLEXITY_API_TIMEOUT_MS);

  try {
    const response = await localClient.responses.create({
      ...params,
    }, {
      signal: controller.signal,
    });
    return response as PerplexityResponseShape;
  } finally {
    clearTimeout(timeout);
  }
}

function getSchemaByType(schemaType: Exclude<SchemaType, "custom">): JsonSchemaDefinition {
  const schemas: Record<Exclude<SchemaType, "custom">, JsonSchemaDefinition> = {
    comparable_sales: {
      name: "comparable_sales",
      schema: {
        type: "object",
        properties: {
          comps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                address: { type: "string" },
                city: { type: "string" },
                parish_or_county: { type: "string" },
                state: { type: "string" },
                property_type: { type: "string" },
                sale_price: { type: "number" },
                price_per_acre: { type: "number" },
                price_per_sf: { type: "number" },
                acres: { type: "number" },
                building_sf: { type: "integer" },
                cap_rate: { type: "number" },
                sale_date: { type: "string" },
                buyer: { type: "string" },
                seller: { type: "string" },
                source: { type: "string" },
              },
            },
          },
        },
      },
    },
    market_metrics: {
      name: "market_metrics",
      schema: {
        type: "object",
        properties: {
          metrics: {
            type: "array",
            items: {
              type: "object",
              properties: {
                metric_name: { type: "string" },
                value: { type: "number" },
                unit: { type: "string" },
                geography: { type: "string" },
                property_type: { type: "string" },
                period: { type: "string" },
                source: { type: "string" },
              },
            },
          },
        },
      },
    },
    permit_data: {
      name: "permit_data",
      schema: {
        type: "object",
        properties: {
          permits: {
            type: "array",
            items: {
              type: "object",
              properties: {
                permit_number: { type: "string" },
                type: { type: "string" },
                description: { type: "string" },
                address: { type: "string" },
                applicant: { type: "string" },
                status: { type: "string" },
                date_filed: { type: "string" },
                date_issued: { type: "string" },
                estimated_cost: { type: "number" },
                source: { type: "string" },
              },
            },
          },
        },
      },
    },
    facility_inventory: {
      name: "facility_inventory",
      schema: {
        type: "object",
        properties: {
          facilities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                address: { type: "string" },
                type: { type: "string" },
                total_sf: { type: "integer" },
                acres: { type: "number" },
                spaces_or_units: { type: "integer" },
                occupancy_pct: { type: "number" },
                asking_rate: { type: "number" },
                owner: { type: "string" },
                source: { type: "string" },
              },
            },
          },
        },
      },
    },
    regulatory_filings: {
      name: "regulatory_filings",
      schema: {
        type: "object",
        properties: {
          filings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                filing_type: { type: "string" },
                agency: { type: "string" },
                description: { type: "string" },
                entity: { type: "string" },
                location: { type: "string" },
                date: { type: "string" },
                status: { type: "string" },
                case_number: { type: "string" },
                source: { type: "string" },
              },
            },
          },
        },
      },
    },
  };

  return schemas[schemaType];
}

export const perplexity_web_research = tool({
  name: "perplexity_web_research",
  description:
    "Search the live web for current information using Perplexity. " +
    "Use this for market intelligence, regulatory updates, recent transactions, and public web research. " +
    "Prefer this over browser_task unless a site requires login or interactive navigation.",
  parameters: z.object({
    query: z.string().describe("Specific web research question with geography and date context when relevant."),
    preset: z.enum(["fast-search", "pro-search", "deep-research"]).nullable()
      .describe("Research depth. null defaults to pro-search."),
    domain_filter: z.array(z.string()).nullable()
      .describe("Optional domain allow/deny list (max 20, prefix with '-' to exclude)."),
    recency: z.enum(["day", "week", "month", "year"]).nullable()
      .describe("Optional recency window for search results."),
  }),
  execute: async ({ query, preset, domain_filter, recency }) => {
    const selectedPreset: PerplexityPreset = preset ?? "pro-search";
    const tools = buildWebTools(domain_filter, recency, selectedPreset !== "fast-search");

    try {
      const response = await createResponse({
        preset: selectedPreset,
        input: query,
        tools,
      });

      return {
        success: true,
        text: response.output_text ?? "",
        sources: extractSources(response.output),
        model: response.model ?? null,
        usage: {
          input_tokens: response.usage?.input_tokens ?? 0,
          output_tokens: response.usage?.output_tokens ?? 0,
          total_tokens: response.usage?.total_tokens ?? 0,
          cost: response.usage?.cost ?? null,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Perplexity web research failed: ${message}`,
      };
    }
  },
});

export const perplexity_structured_extract = tool({
  name: "perplexity_structured_extract",
  description:
    "Extract machine-readable structured data from the web via Perplexity JSON Schema responses. " +
    "Use for comparable sales, market metrics, permits, facility inventories, and regulatory filings.",
  parameters: z.object({
    query: z.string().describe("Precise extraction request including geography, date range, and required fields."),
    schema_type: z.enum([
      "comparable_sales",
      "market_metrics",
      "permit_data",
      "facility_inventory",
      "regulatory_filings",
      "custom",
    ]),
    custom_schema: z.string().nullable()
      .describe("Custom JSON Schema as a JSON string. Required only when schema_type is custom."),
    domain_filter: z.array(z.string()).nullable()
      .describe("Optional domain allow/deny list (max 20, prefix with '-' to exclude)."),
    recency: z.enum(["day", "week", "month", "year"]).nullable()
      .describe("Optional recency window for search results."),
  }),
  execute: async ({ query, schema_type, custom_schema, domain_filter, recency }) => {
    let jsonSchemaDefinition: JsonSchemaDefinition;

    if (schema_type === "custom") {
      if (!custom_schema) {
        return {
          success: false,
          error: "custom_schema is required when schema_type is custom",
        };
      }
      try {
        const parsedSchema = JSON.parse(custom_schema) as Record<string, unknown>;
        jsonSchemaDefinition = {
          name: "custom_extract",
          schema: parsedSchema,
        };
      } catch {
        return {
          success: false,
          error: "custom_schema must be valid JSON",
        };
      }
    } else {
      jsonSchemaDefinition = getSchemaByType(schema_type);
    }

    const responseFormat: ResponseFormatJsonSchema = {
      type: "json_schema",
      json_schema: {
        name: jsonSchemaDefinition.name,
        schema: jsonSchemaDefinition.schema,
      },
    };

    const tools = buildWebTools(domain_filter, recency, true);

    try {
      const response = await createResponse({
        preset: "pro-search",
        input: query,
        tools,
        response_format: responseFormat,
      });

      let data: unknown = null;
      let parseError: string | null = null;
      try {
        data = JSON.parse(response.output_text ?? "");
      } catch (error) {
        parseError = error instanceof Error ? error.message : "Failed to parse JSON output";
      }

      return {
        success: data !== null,
        data,
        raw_text: data === null ? response.output_text ?? "" : null,
        parse_error: parseError,
        sources: extractSources(response.output),
        model: response.model ?? null,
        usage: {
          input_tokens: response.usage?.input_tokens ?? 0,
          output_tokens: response.usage?.output_tokens ?? 0,
          total_tokens: response.usage?.total_tokens ?? 0,
          cost: response.usage?.cost ?? null,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Perplexity structured extraction failed: ${message}`,
      };
    }
  },
});

export const perplexity_deep_research = tool({
  name: "perplexity_deep_research",
  description:
    "Run high-depth web research using Perplexity advanced-deep-research preset. " +
    "Use for investment memo market sections and comprehensive due diligence analysis.",
  parameters: z.object({
    query: z.string().describe("Comprehensive research query with explicit analysis dimensions."),
    domain_filter: z.array(z.string()).nullable()
      .describe("Optional domain allow/deny list (max 20, prefix with '-' to exclude)."),
  }),
  execute: async ({ query, domain_filter }) => {
    const tools = buildWebTools(domain_filter, null, true);

    try {
      const response = await createResponse({
        preset: "advanced-deep-research",
        input: query,
        tools,
      });

      return {
        success: true,
        text: response.output_text ?? "",
        sources: extractSources(response.output),
        model: response.model ?? null,
        usage: {
          input_tokens: response.usage?.input_tokens ?? 0,
          output_tokens: response.usage?.output_tokens ?? 0,
          total_tokens: response.usage?.total_tokens ?? 0,
          cost: response.usage?.cost ?? null,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Perplexity deep research failed: ${message}`,
      };
    }
  },
});

export const perplexity_quick_lookup = tool({
  name: "perplexity_quick_lookup",
  description:
    "Run a fast, low-cost factual web lookup via Perplexity fast-search preset. " +
    "Use for simple current facts and quick verification tasks.",
  parameters: z.object({
    query: z.string().describe("Single factual question for quick lookup."),
  }),
  execute: async ({ query }) => {
    try {
      const response = await createResponse({
        preset: "fast-search",
        input: query,
      });

      return {
        success: true,
        text: response.output_text ?? "",
        model: response.model ?? null,
        usage: {
          input_tokens: response.usage?.input_tokens ?? 0,
          output_tokens: response.usage?.output_tokens ?? 0,
          total_tokens: response.usage?.total_tokens ?? 0,
          cost: response.usage?.cost ?? null,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Perplexity quick lookup failed: ${message}`,
      };
    }
  },
});
