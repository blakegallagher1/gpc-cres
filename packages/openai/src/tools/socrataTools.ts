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

function getSocrataBaseUrl(): string {
  return process.env.SOCRATA_BASE_URL || "https://data.brla.gov/resource";
}

function getSocrataAppToken(): string | undefined {
  return process.env.SOCRATA_APP_TOKEN;
}

function getBuildingPermitsDatasetId(): string {
  return process.env.SOCRATA_EBR_PERMITS_DATASET_ID || "7fq7-8j7r";
}

function escapeSoqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

// ---------------------------------------------------------------------------
// Tool: queryBuildingPermits
// ---------------------------------------------------------------------------

export const queryBuildingPermits = tool({
  name: "query_building_permits",
  description:
    "Queries the live East Baton Rouge Parish building permits dataset " +
    "for permits filed within a given zip code over a configurable lookback window.",
  parameters: z.object({
    zipCode: z.string().describe("5-digit zip code to search"),
    monthsBack: z
      .number()
      .optional().nullable()
      .describe("Months of history to retrieve (default 12)"),
    designation: z
      .enum(["Commercial", "Residential", "All"])
      .optional().nullable()
      .describe("Optional designation filter; defaults to Commercial."),
    permitTypes: z
      .array(z.string())
      .optional().nullable()
      .describe(
        "Optional raw permit-type filter strings, e.g. ['Occupancy Permit (C)']. " +
          "Defaults to all permit types within the selected designation."
      ),
    limit: z
      .number()
      .optional().nullable()
      .describe("Maximum number of permits to return (default 50, max 200)"),
  }),
  execute: async ({
    zipCode,
    monthsBack,
    designation,
    permitTypes,
    limit,
  }: {
    zipCode: string;
    monthsBack?: number | null;
    designation?: "Commercial" | "Residential" | "All" | null;
    permitTypes?: string[] | null;
    limit?: number | null;
  }): Promise<string> => {
    const months = monthsBack ?? 12;
    const normalizedLimit = Math.max(1, Math.min(limit ?? 50, 200));

    const sinceDate = new Date();
    sinceDate.setMonth(sinceDate.getMonth() - months);
    const sinceISO = sinceDate.toISOString().slice(0, 10);
    const whereClauses = [
      `zip='${escapeSoqlLiteral(zipCode)}'`,
      `issueddate >= '${sinceISO}'`,
      "parishname = 'East Baton Rouge'",
    ];

    if (designation && designation !== "All") {
      whereClauses.push(`designation='${escapeSoqlLiteral(designation)}'`);
    } else if (!designation) {
      whereClauses.push("designation='Commercial'");
    }

    if (permitTypes && permitTypes.length > 0) {
      const typeFilter = permitTypes
        .map((type) => `'${escapeSoqlLiteral(type)}'`)
        .join(",");
      whereClauses.push(`permittype IN (${typeFilter})`);
    }

    const params = new URLSearchParams({
      $select:
        "permitnumber,permittype,designation,projectdescription,projectvalue,permitfee,issueddate,address,zip,ownername,applicantname,contractorname",
      $where: whereClauses.join(" AND "),
      $order: "issueddate DESC",
      $limit: String(normalizedLimit),
    });

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    const appToken = getSocrataAppToken();
    if (appToken) headers["X-App-Token"] = appToken;

    try {
      const url = `${getSocrataBaseUrl()}/${getBuildingPermitsDatasetId()}.json?${params.toString()}`;

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
      const permitTypeCounts = permits.reduce<Record<string, number>>((acc, permit) => {
        const permitType =
          typeof permit.permittype === "string" && permit.permittype.trim().length > 0
            ? permit.permittype
            : "Unknown";
        acc[permitType] = (acc[permitType] ?? 0) + 1;
        return acc;
      }, {});

      return JSON.stringify({
        success: true,
        zipCode,
        timeframeMonths: months,
        designation: designation ?? "Commercial",
        permitCount: permits.length,
        permitTypeCounts,
        permits,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return JSON.stringify({ error: `Socrata query failed: ${msg}` });
    }
  },
});
