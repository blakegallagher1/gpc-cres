export type BuildingPermitsDesignation = "all" | "commercial" | "residential";

export type BuildingPermitsFeedOptions = {
  days: number;
  designation: BuildingPermitsDesignation;
  limit: number;
  permitType?: string | null;
  zipCode?: string | null;
};

export type BuildingPermitsTotals = {
  permitCount: number;
  totalProjectValue: number;
  averageProjectValue: number | null;
  totalPermitFees: number;
  latestIssuedDate: string | null;
};

export type BuildingPermitsTrendPoint = {
  issuedDay: string;
  permitCount: number;
  totalProjectValue: number;
};

export type BuildingPermitsBreakdownPoint = {
  label: string;
  permitCount: number;
  totalProjectValue: number;
};

export type BuildingPermitRecord = {
  permitNumber: string;
  permitType: string;
  designation: string | null;
  projectDescription: string | null;
  projectValue: number;
  permitFee: number;
  issuedDate: string | null;
  address: string | null;
  zip: string | null;
  ownerName: string | null;
  applicantName: string | null;
  contractorName: string | null;
};

export type BuildingPermitsFeed = {
  dataset: {
    id: string;
    sourceUrl: string;
    apiBaseUrl: string;
    refreshedAt: string;
  };
  filters: BuildingPermitsFeedOptions;
  totals: BuildingPermitsTotals;
  issuedTrend: BuildingPermitsTrendPoint[];
  designationBreakdown: BuildingPermitsBreakdownPoint[];
  topPermitTypes: BuildingPermitsBreakdownPoint[];
  topZipCodes: BuildingPermitsBreakdownPoint[];
  recentPermits: BuildingPermitRecord[];
  warnings: string[];
  partial: boolean;
  fallbackUsed: boolean;
};

const DEFAULT_SOCRATA_BASE_URL = "https://data.brla.gov/resource";
const DEFAULT_SOCRATA_DATASET_ID = "7fq7-8j7r";
const SOCRATA_QUERY_TIMEOUT_MS = 15_000;

type BuildingPermitsQueryName =
  | "totals"
  | "issuedTrend"
  | "designationBreakdown"
  | "topPermitTypes"
  | "topZipCodes"
  | "recentPermits";

type SocrataQueryDefinition = {
  name: BuildingPermitsQueryName;
  required: boolean;
  params: Record<string, string>;
};

class SocrataQueryError extends Error {
  readonly queryName: BuildingPermitsQueryName;
  readonly status: number | null;
  readonly statusText: string | null;
  readonly snippet: string | null;

  constructor(args: {
    queryName: BuildingPermitsQueryName;
    message: string;
    status?: number | null;
    statusText?: string | null;
    snippet?: string | null;
  }) {
    super(args.message);
    this.name = "SocrataQueryError";
    this.queryName = args.queryName;
    this.status = args.status ?? null;
    this.statusText = args.statusText ?? null;
    this.snippet = args.snippet ?? null;
  }
}

const lastGoodBuildingPermitsFeedCache = new Map<string, BuildingPermitsFeed>();

function escapeSoqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function getSocrataBaseUrl(): string {
  return (process.env.SOCRATA_BASE_URL ?? DEFAULT_SOCRATA_BASE_URL).replace(/\/+$/, "");
}

function getDatasetId(): string {
  return process.env.SOCRATA_EBR_PERMITS_DATASET_ID ?? DEFAULT_SOCRATA_DATASET_ID;
}

function socrataHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (process.env.SOCRATA_APP_TOKEN) {
    headers["X-App-Token"] = process.env.SOCRATA_APP_TOKEN;
  }
  return headers;
}

function getDatasetPageUrl(): string {
  return `https://data.brla.gov/Housing-and-Development/EBR-Building-Permits/${getDatasetId()}/about_data`;
}

function getCacheKey(options: BuildingPermitsFeedOptions): string {
  return JSON.stringify([
    options.days,
    options.designation,
    options.limit,
    options.permitType ?? null,
    options.zipCode ?? null,
  ]);
}

function truncateSnippet(value: string, maxLength = 240): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function getQueryLabel(queryName: BuildingPermitsQueryName): string {
  switch (queryName) {
    case "totals":
      return "permit totals";
    case "issuedTrend":
      return "issued trend";
    case "designationBreakdown":
      return "designation breakdown";
    case "topPermitTypes":
      return "permit type breakdown";
    case "topZipCodes":
      return "zip code breakdown";
    case "recentPermits":
      return "recent permits";
  }
}

function formatWarningMessage(error: SocrataQueryError): string {
  const queryLabel = getQueryLabel(error.queryName);
  const statusPart =
    error.status !== null
      ? ` (${error.status}${error.statusText ? ` ${error.statusText}` : ""})`
      : "";
  return `${queryLabel} data is temporarily unavailable${statusPart}.`;
}

function parseNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function parseNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = parseNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildWhereClause(options: BuildingPermitsFeedOptions): string {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - options.days);

  const clauses = [
    "parishname = 'East Baton Rouge'",
    `issueddate >= '${since.toISOString().slice(0, 10)}'`,
  ];

  if (options.designation === "commercial") {
    clauses.push("designation = 'Commercial'");
  }

  if (options.designation === "residential") {
    clauses.push("designation = 'Residential'");
  }

  if (options.permitType) {
    clauses.push(`permittype = '${escapeSoqlLiteral(options.permitType)}'`);
  }

  if (options.zipCode) {
    clauses.push(`zip = '${escapeSoqlLiteral(options.zipCode)}'`);
  }

  return clauses.join(" AND ");
}

async function fetchSocrataRows<T extends Record<string, unknown>>(
  queryName: BuildingPermitsQueryName,
  params: Record<string, string>,
): Promise<T[]> {
  const search = new URLSearchParams(params);
  const url = `${getSocrataBaseUrl()}/${getDatasetId()}.json?${search.toString()}`;
  try {
    const response = await fetch(url, {
      headers: socrataHeaders(),
      cache: "no-store",
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(SOCRATA_QUERY_TIMEOUT_MS),
    });

    if (!response.ok) {
      const snippet = truncateSnippet(await response.text().catch(() => ""));
      throw new SocrataQueryError({
        queryName,
        message: `Socrata returned ${response.status} ${response.statusText}`,
        status: response.status,
        statusText: response.statusText,
        snippet: snippet.length > 0 ? snippet : null,
      });
    }

    return (await response.json()) as T[];
  } catch (error) {
    if (error instanceof SocrataQueryError) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : "Unknown Socrata request failure";
    throw new SocrataQueryError({
      queryName,
      message,
    });
  }
}

export async function getEbrBuildingPermitsFeed(
  options: BuildingPermitsFeedOptions,
): Promise<BuildingPermitsFeed> {
  const where = buildWhereClause(options);
  const commonSelectFields = [
    "permitnumber",
    "permittype",
    "designation",
    "projectdescription",
    "projectvalue",
    "permitfee",
    "issueddate",
    "address",
    "zip",
    "ownername",
    "applicantname",
    "contractorname",
  ].join(",");

  const cacheKey = getCacheKey(options);
  const queries: SocrataQueryDefinition[] = [
    {
      name: "totals",
      required: true,
      params: {
        $select:
          "count(*) as permit_count," +
          "sum(projectvalue) as total_project_value," +
          "avg(projectvalue) as average_project_value," +
          "sum(permitfee) as total_permit_fees," +
          "max(issueddate) as latest_issued_date",
        $where: where,
      },
    },
    {
      name: "issuedTrend",
      required: false,
      params: {
        $select:
          "date_trunc_ymd(issueddate) as issued_day," +
          "count(*) as permit_count," +
          "sum(projectvalue) as total_project_value",
        $where: where,
        $group: "issued_day",
        $order: "issued_day ASC",
        $limit: "366",
      },
    },
    {
      name: "designationBreakdown",
      required: false,
      params: {
        $select:
          "coalesce(designation, 'Unknown') as designation_label," +
          "count(*) as permit_count," +
          "sum(projectvalue) as total_project_value",
        $where: where,
        $group: "designation_label",
        $order: "permit_count DESC",
        $limit: "10",
      },
    },
    {
      name: "topPermitTypes",
      required: false,
      params: {
        $select:
          "coalesce(permittype, 'Unknown') as permit_type_label," +
          "count(*) as permit_count," +
          "sum(projectvalue) as total_project_value",
        $where: where,
        $group: "permit_type_label",
        $order: "permit_count DESC",
        $limit: "10",
      },
    },
    {
      name: "topZipCodes",
      required: false,
      params: {
        $select:
          "zip," +
          "count(*) as permit_count," +
          "sum(projectvalue) as total_project_value",
        $where: where,
        $group: "zip",
        $order: "permit_count DESC",
        $limit: "10",
      },
    },
    {
      name: "recentPermits",
      required: false,
      params: {
        $select: commonSelectFields,
        $where: where,
        $order: "issueddate DESC",
        $limit: String(options.limit),
      },
    },
  ];

  const settledQueries = await Promise.allSettled(
    queries.map((query) => fetchSocrataRows<Record<string, unknown>>(query.name, query.params)),
  );

  const warnings: string[] = [];
  const queryRows = new Map<BuildingPermitsQueryName, Record<string, unknown>[]>();
  let requiredQueryFailed = false;

  for (const [index, settledQuery] of settledQueries.entries()) {
    const query = queries[index];
    if (!query) {
      continue;
    }

    if (settledQuery.status === "fulfilled") {
      queryRows.set(query.name, settledQuery.value);
      continue;
    }

    const error =
      settledQuery.reason instanceof SocrataQueryError
        ? settledQuery.reason
        : new SocrataQueryError({
            queryName: query.name,
            message:
              settledQuery.reason instanceof Error
                ? settledQuery.reason.message
                : "Unknown Socrata request failure",
          });

    console.warn("[building-permits] upstream query failed", {
      queryName: error.queryName,
      required: query.required,
      status: error.status,
      statusText: error.statusText,
      snippet: error.snippet,
      message: error.message,
    });

    warnings.push(formatWarningMessage(error));
    queryRows.set(query.name, []);
    if (query.required) {
      requiredQueryFailed = true;
    }
  }

  if (requiredQueryFailed) {
    const cachedFeed = lastGoodBuildingPermitsFeedCache.get(cacheKey);
    if (cachedFeed) {
      const fallbackWarnings = [
        "Serving the last successful building permits snapshot because a required Socrata query failed.",
        ...warnings,
      ];
      console.warn("[building-permits] serving cached last-good payload", {
        cacheKey,
        warnings: fallbackWarnings,
        refreshedAt: cachedFeed.dataset.refreshedAt,
      });

      return {
        ...cachedFeed,
        warnings: fallbackWarnings,
        fallbackUsed: true,
        partial: false,
      };
    }

    throw new Error("Building permits feed unavailable because a required Socrata query failed");
  }

  const totalsRows = queryRows.get("totals") ?? [];
  const issuedTrendRows = queryRows.get("issuedTrend") ?? [];
  const designationRows = queryRows.get("designationBreakdown") ?? [];
  const permitTypeRows = queryRows.get("topPermitTypes") ?? [];
  const zipRows = queryRows.get("topZipCodes") ?? [];
  const recentPermitRows = queryRows.get("recentPermits") ?? [];

  const totalsRow = totalsRows[0] ?? {};
  const refreshedAt = new Date().toISOString();

  const feed: BuildingPermitsFeed = {
    dataset: {
      id: getDatasetId(),
      sourceUrl: getDatasetPageUrl(),
      apiBaseUrl: getSocrataBaseUrl(),
      refreshedAt,
    },
    filters: options,
    totals: {
      permitCount: parseNumber(totalsRow.permit_count),
      totalProjectValue: parseNumber(totalsRow.total_project_value),
      averageProjectValue: parseNullableNumber(totalsRow.average_project_value),
      totalPermitFees: parseNumber(totalsRow.total_permit_fees),
      latestIssuedDate: parseNullableString(totalsRow.latest_issued_date),
    },
    issuedTrend: issuedTrendRows.map((row) => ({
      issuedDay: parseNullableString(row.issued_day) ?? "Unknown",
      permitCount: parseNumber(row.permit_count),
      totalProjectValue: parseNumber(row.total_project_value),
    })),
    designationBreakdown: designationRows.map((row) => ({
      label: parseNullableString(row.designation_label) ?? "Unknown",
      permitCount: parseNumber(row.permit_count),
      totalProjectValue: parseNumber(row.total_project_value),
    })),
    topPermitTypes: permitTypeRows.map((row) => ({
      label: parseNullableString(row.permit_type_label) ?? "Unknown",
      permitCount: parseNumber(row.permit_count),
      totalProjectValue: parseNumber(row.total_project_value),
    })),
    topZipCodes: zipRows.map((row) => ({
      label: parseNullableString(row.zip) ?? "Unknown",
      permitCount: parseNumber(row.permit_count),
      totalProjectValue: parseNumber(row.total_project_value),
    })),
    recentPermits: recentPermitRows.map((row) => ({
      permitNumber: parseNullableString(row.permitnumber) ?? "Unknown",
      permitType: parseNullableString(row.permittype) ?? "Unknown",
      designation: parseNullableString(row.designation),
      projectDescription: parseNullableString(row.projectdescription),
      projectValue: parseNumber(row.projectvalue),
      permitFee: parseNumber(row.permitfee),
      issuedDate: parseNullableString(row.issueddate),
      address: parseNullableString(row.address),
      zip: parseNullableString(row.zip),
      ownerName: parseNullableString(row.ownername),
      applicantName: parseNullableString(row.applicantname),
      contractorName: parseNullableString(row.contractorname),
    })),
    warnings,
    partial: warnings.length > 0,
    fallbackUsed: false,
  };

  if (!feed.partial) {
    lastGoodBuildingPermitsFeedCache.set(cacheKey, feed);
  }

  return feed;
}

export function __resetBuildingPermitsFeedCacheForTests(): void {
  lastGoodBuildingPermitsFeedCache.clear();
}
