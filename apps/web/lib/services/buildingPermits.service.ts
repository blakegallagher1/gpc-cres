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
};

const DEFAULT_SOCRATA_BASE_URL = "https://data.brla.gov/resource";
const DEFAULT_SOCRATA_DATASET_ID = "7fq7-8j7r";

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
  params: Record<string, string>,
): Promise<T[]> {
  const search = new URLSearchParams(params);
  const url = `${getSocrataBaseUrl()}/${getDatasetId()}.json?${search.toString()}`;
  const response = await fetch(url, {
    headers: socrataHeaders(),
    cache: "no-store",
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Socrata returned ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T[];
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

  const [
    totalsRows,
    issuedTrendRows,
    designationRows,
    permitTypeRows,
    zipRows,
    recentPermitRows,
  ] = await Promise.all([
    fetchSocrataRows<Record<string, unknown>>({
      $select:
        "count(*) as permit_count," +
        "sum(projectvalue) as total_project_value," +
        "avg(projectvalue) as average_project_value," +
        "sum(permitfee) as total_permit_fees," +
        "max(issueddate) as latest_issued_date",
      $where: where,
    }),
    fetchSocrataRows<Record<string, unknown>>({
      $select:
        "date_trunc_ymd(issueddate) as issued_day," +
        "count(*) as permit_count," +
        "sum(projectvalue) as total_project_value",
      $where: where,
      $group: "issued_day",
      $order: "issued_day ASC",
      $limit: "366",
    }),
    fetchSocrataRows<Record<string, unknown>>({
      $select:
        "coalesce(designation, 'Unknown') as designation_label," +
        "count(*) as permit_count," +
        "sum(projectvalue) as total_project_value",
      $where: where,
      $group: "designation_label",
      $order: "permit_count DESC",
      $limit: "10",
    }),
    fetchSocrataRows<Record<string, unknown>>({
      $select:
        "coalesce(permittype, 'Unknown') as permit_type_label," +
        "count(*) as permit_count," +
        "sum(projectvalue) as total_project_value",
      $where: where,
      $group: "permit_type_label",
      $order: "permit_count DESC",
      $limit: "10",
    }),
    fetchSocrataRows<Record<string, unknown>>({
      $select:
        "zip," +
        "count(*) as permit_count," +
        "sum(projectvalue) as total_project_value",
      $where: where,
      $group: "zip",
      $order: "permit_count DESC",
      $limit: "10",
    }),
    fetchSocrataRows<Record<string, unknown>>({
      $select: commonSelectFields,
      $where: where,
      $order: "issueddate DESC",
      $limit: String(options.limit),
    }),
  ]);

  const totalsRow = totalsRows[0] ?? {};
  const refreshedAt = new Date().toISOString();

  return {
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
  };
}
