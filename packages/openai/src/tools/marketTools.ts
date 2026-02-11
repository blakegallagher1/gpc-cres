import { tool } from "@openai/agents";
import { z } from "zod";

/**
 * query_market_data — lets agents query the market monitoring database
 * for parish-level comps, listings, permits, and trends.
 */
export const query_market_data = tool({
  name: "query_market_data",
  description:
    "Query the market monitoring database for comp sales, active listings, permits, vacancy, and rent data. " +
    "Can retrieve parish-level summaries, monthly trend data, or recent data points filtered by type.",
  parameters: z.object({
    view: z
      .enum(["summary", "trends", "recent"])
      .describe(
        "summary = parish aggregate stats (90d). trends = monthly time-series. recent = raw data feed."
      ),
    parish: z
      .string()
      .nullable()
      .describe("Parish name (required for summary/trends, optional for recent)."),
    data_type: z
      .enum(["comp_sale", "listing", "permit", "vacancy", "rent"])
      .nullable()
      .describe("Filter by data type (only used with recent view)."),
    months: z
      .number()
      .nullable()
      .describe("Number of months for trends view (default 12)."),
    limit: z
      .number()
      .nullable()
      .describe("Max records for recent view (default 50)."),
  }),
  execute: async (params) => {
    // Delegate to API — this runs server-side in the chat route context
    return JSON.stringify({
      _marketQuery: true,
      ...params,
    });
  },
});
