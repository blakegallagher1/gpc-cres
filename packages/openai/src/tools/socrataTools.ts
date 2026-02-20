import { tool } from "@openai/agents";
import { z } from "zod";

/**
 * Socrata Municipal Open Data Tools
 *
 * Queries city/parish open-data portals via the SODA API for building permit
 * activity. Each portal exposes a dataset identifier (the "resource ID") that
 * varies by municipality — set SOCRATA_BASE_URL to the target portal.
 *
 * Environment:
 *   SOCRATA_BASE_URL  – e.g. "https://data.brla.gov/resource"
 *   SOCRATA_APP_TOKEN – optional but raises rate-limit ceiling
 */

const SOCRATA_BASE_URL =
  process.env.SOCRATA_BASE_URL || "https://data.brla.gov/resource";
const APP_TOKEN = process.env.SOCRATA_APP_TOKEN;

// ---------------------------------------------------------------------------
// Tool: queryBuildingPermits
// ---------------------------------------------------------------------------

export const queryBuildingPermits = tool({
  name: "query_building_permits",
  description:
    "Queries a municipal open-data portal (Socrata SODA API) for commercial " +
    "renovation and new-construction permits filed within a given zip code " +
    "over a configurable lookback window.",
  parameters: z.object({
    zipCode: z.string().describe("5-digit zip code to search"),
    monthsBack: z
      .number()
      .nullable()
      .describe("Months of history to retrieve (default 12)"),
    permitTypes: z
      .array(z.string())
      .nullable()
      .describe(
        "Optional permit-type filter strings, e.g. ['renovation','new_construction']. " +
          "Defaults to commercial renovation + new construction."
      ),
  }),
  execute: async ({
    zipCode,
    monthsBack,
    permitTypes,
  }: {
    zipCode: string;
    monthsBack: number | null;
    permitTypes: string[] | null;
  }): Promise<string> => {
    const months = monthsBack ?? 12;
    const types = permitTypes ?? ["renovation", "new_construction"];

    const sinceDate = new Date();
    sinceDate.setMonth(sinceDate.getMonth() - months);
    const sinceISO = sinceDate.toISOString().slice(0, 10);

    // Build SoQL query — resource ID is portal-specific; replace
    // PLACEHOLDER_DATASET_ID with the real EBR building-permits dataset ID.
    const typeFilter = types.map((t) => `'${t}'`).join(",");
    const soql =
      `$where=zipcode='${zipCode}' ` +
      `AND permit_type IN (${typeFilter}) ` +
      `AND filed_date >= '${sinceISO}' ` +
      `&$order=filed_date DESC&$limit=200`;

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (APP_TOKEN) headers["X-App-Token"] = APP_TOKEN;

    try {
      const url = `${SOCRATA_BASE_URL}/PLACEHOLDER_DATASET_ID.json?${soql}`;

      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        return JSON.stringify({
          error: `Socrata returned ${res.status}: ${res.statusText}`,
        });
      }

      const permits = (await res.json()) as Array<Record<string, unknown>>;

      return JSON.stringify({
        success: true,
        zipCode,
        timeframeMonths: months,
        permitCount: permits.length,
        permits: permits.slice(0, 25), // cap payload sent back to agent
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return JSON.stringify({ error: `Socrata query failed: ${msg}` });
    }
  },
});
