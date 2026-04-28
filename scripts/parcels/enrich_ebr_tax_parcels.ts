import "dotenv/config";

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

type CliOptions = {
  apply: boolean;
  batchSize: number;
  maxRows: number | null;
};

type ArcgisMetadata = {
  maxRecordCount?: number;
};

type ArcgisFeature = {
  attributes?: Record<string, unknown>;
};

type ArcgisQueryResponse = {
  count?: number;
  features?: ArcgisFeature[];
};

type EnrichmentRow = {
  parcelId: string;
  ownerMailingAddress: string | null;
  ownerCityStateZip: string | null;
  siteAddress: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  legalDescription: string | null;
  landValue: number | null;
  improvementValue: number | null;
  marketValue: number | null;
  assessedValue: number | null;
  saleYear: number | null;
  saleDate: string | null;
  salePrice: number | null;
  taxAmount: number | null;
  floodZone: string | null;
  rawPayload: string;
};

const PARISH = "East Baton Rouge";
const SOURCE_NAME = "EBR Assessor Tax Parcel ArcGIS REST";
const SOURCE_URI = "https://maps.brla.gov/gis/rest/services/Cadastral/Tax_Parcel/MapServer/0";
const DEFAULT_BATCH_SIZE = 2000;
const SCHEMA_SQL_PATH = "infra/sql/zoning/007-assessor-enrichment-surface.sql";
const TAX_PARCEL_FIELDS = [
  "ASSESSMENT_NUM",
  "PRONO",
  "OWNER",
  "OWNER_ADDRESS",
  "OWNER_CITY_STATE_ZIP",
  "PHYSICAL_ADDRESS",
  "LEGAL_DESCRIPTION",
  "FLOOD_ZONE",
  "SALE_YEAR",
  "SUM_LAND_VALUE",
  "SUM_IMPROVEMENT_VALUE",
  "SUM_FAIR_MARKET_VALUE",
  "SUM_ASSESSED_VALUE",
].join(",");

function parseCli(args: string[]): CliOptions {
  const getValue = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
  const maxRowsValue = getValue("--max-rows");
  return {
    apply: args.includes("--apply"),
    batchSize: Math.max(100, Number(getValue("--batch-size") ?? DEFAULT_BATCH_SIZE)),
    maxRows: maxRowsValue ? Math.max(1, Number(maxRowsValue)) : null,
  };
}

function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : fallback;
}

function runRemotePsql(input: string): string {
  const localPsqlCommand = process.env.PROPERTY_DB_PSQL_CMD;
  if (localPsqlCommand && localPsqlCommand.trim().length > 0) {
    return execFileSync("sh", ["-c", localPsqlCommand], {
      encoding: "utf8",
      input,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  }

  const host = optionalEnv("PROPERTY_DB_SSH_HOST", "bg");
  const container = optionalEnv("PROPERTY_DB_CONTAINER", "entitlement-os-postgres");
  const database = optionalEnv("PROPERTY_DB_NAME", "entitlement_os");
  const user = optionalEnv("PROPERTY_DB_USER", "postgres");
  return execFileSync(
    "ssh",
    [
      host,
      "docker",
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      user,
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed ${response.status} ${response.statusText}: ${url}`);
  }
  return (await response.json()) as T;
}

function buildQueryUrl(params: Record<string, string | number | boolean>): string {
  const url = new URL(`${SOURCE_URI}/query`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function valueText(attributes: Record<string, unknown>, field: string): string | null {
  const value = attributes[field];
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function valueNumber(attributes: Record<string, unknown>, field: string): number | null {
  const value = attributes[field];
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSaleYear(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/\b(18|19|20)\d{2}\b/);
  if (!match) return null;
  const year = Number(match[0]);
  const nextYear = new Date().getUTCFullYear() + 1;
  return year >= 1800 && year <= nextYear ? year : null;
}

function parseOwnerMailZip(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/\b\d{5}(?:-\d{4})?\b/);
  return match ? match[0] : null;
}

function parseOwnerMailCity(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^\s*(.+?)\s+([A-Z]{2})\s+\d{5}(?:-\d{4})?\s*$/);
  return match ? match[1].trim() : null;
}

function parseOwnerMailState(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/);
  return match ? match[1] : null;
}

function toRow(feature: ArcgisFeature): EnrichmentRow | null {
  const attributes = feature.attributes ?? {};
  const parcelId = valueText(attributes, "PRONO") ?? valueText(attributes, "ASSESSMENT_NUM");
  if (!parcelId) return null;
  const ownerCityStateZip = valueText(attributes, "OWNER_CITY_STATE_ZIP");
  const saleYear = parseSaleYear(valueText(attributes, "SALE_YEAR"));
  return {
    parcelId,
    ownerMailingAddress: valueText(attributes, "OWNER_ADDRESS"),
    ownerCityStateZip,
    siteAddress: valueText(attributes, "PHYSICAL_ADDRESS"),
    city: parseOwnerMailCity(ownerCityStateZip),
    state: parseOwnerMailState(ownerCityStateZip),
    zip: parseOwnerMailZip(ownerCityStateZip),
    legalDescription: valueText(attributes, "LEGAL_DESCRIPTION"),
    landValue: valueNumber(attributes, "SUM_LAND_VALUE"),
    improvementValue:
      valueNumber(attributes, "SUM_IMPROVEMENT_VALUE") ??
      (() => {
        const marketValue = valueNumber(attributes, "SUM_FAIR_MARKET_VALUE");
        const landValue = valueNumber(attributes, "SUM_LAND_VALUE");
        if (marketValue === null || landValue === null || marketValue < landValue) return null;
        return marketValue - landValue;
      })(),
    marketValue: valueNumber(attributes, "SUM_FAIR_MARKET_VALUE"),
    assessedValue: valueNumber(attributes, "SUM_ASSESSED_VALUE"),
    saleYear,
    saleDate: saleYear ? `${saleYear}-01-01` : null,
    salePrice: null,
    taxAmount: null,
    floodZone: valueText(attributes, "FLOOD_ZONE"),
    rawPayload: JSON.stringify(attributes),
  };
}

function uniqueRows(rows: EnrichmentRow[]): EnrichmentRow[] {
  const rowsByParcel = new Map<string, EnrichmentRow>();
  for (const row of rows) {
    if (!rowsByParcel.has(row.parcelId)) {
      rowsByParcel.set(row.parcelId, row);
    }
  }
  return [...rowsByParcel.values()];
}

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const raw = String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

function buildUploadSql(rows: EnrichmentRow[]): string {
  const header = [
    "parcel_id",
    "owner_mailing_address",
    "owner_city_state_zip",
    "site_address",
    "city",
    "state",
    "zip",
    "legal_description",
    "land_value",
    "improvement_value",
    "market_value",
    "assessed_value",
    "sale_year",
    "sale_date",
    "sale_price",
    "tax_amount",
    "flood_zone",
    "raw_payload",
  ].join(",");
  const csvRows = rows.map((row) =>
    [
      row.parcelId,
      row.ownerMailingAddress,
      row.ownerCityStateZip,
      row.siteAddress,
      row.city,
      row.state,
      row.zip,
      row.legalDescription,
      row.landValue,
      row.improvementValue,
      row.marketValue,
      row.assessedValue,
      row.saleYear,
      row.saleDate,
      row.salePrice,
      row.taxAmount,
      row.floodZone,
      row.rawPayload,
    ]
      .map(csvCell)
      .join(","),
  );

  return `
BEGIN;
CREATE TEMP TABLE parcel_assessor_enrichment_upload (
  parcel_id text,
  owner_mailing_address text,
  owner_city_state_zip text,
  site_address text,
  city text,
  state text,
  zip text,
  legal_description text,
  land_value numeric,
  improvement_value numeric,
  market_value numeric,
  assessed_value numeric,
  sale_year integer,
  sale_date date,
  sale_price numeric,
  tax_amount numeric,
  flood_zone text,
  raw_payload jsonb
) ON COMMIT DROP;
\\copy parcel_assessor_enrichment_upload FROM STDIN WITH (FORMAT csv, HEADER true)
${header}
${csvRows.join("\n")}
\\.
INSERT INTO property.parcel_assessor_enrichment (
  parish,
  parcel_id,
  source_name,
  source_uri,
  owner_mailing_address,
  owner_city_state_zip,
  site_address,
  city,
  state,
  zip,
  legal_description,
  land_value,
  improvement_value,
  market_value,
  assessed_value,
  sale_year,
  sale_date,
  sale_price,
  tax_amount,
  flood_zone,
  raw_payload,
  imported_at
)
SELECT
  'East Baton Rouge',
  parcel_id,
  'EBR Assessor Tax Parcel ArcGIS REST',
  'https://maps.brla.gov/gis/rest/services/Cadastral/Tax_Parcel/MapServer/0',
  NULLIF(owner_mailing_address, ''),
  NULLIF(owner_city_state_zip, ''),
  NULLIF(site_address, ''),
  NULLIF(city, ''),
  NULLIF(state, ''),
  NULLIF(zip, ''),
  NULLIF(legal_description, ''),
  land_value,
  improvement_value,
  market_value,
  assessed_value,
  sale_year,
  sale_date,
  sale_price,
  tax_amount,
  NULLIF(flood_zone, ''),
  raw_payload,
  now()
FROM parcel_assessor_enrichment_upload
ON CONFLICT (parish, parcel_id) DO UPDATE
SET source_name = EXCLUDED.source_name,
    source_uri = EXCLUDED.source_uri,
    owner_mailing_address = EXCLUDED.owner_mailing_address,
    owner_city_state_zip = EXCLUDED.owner_city_state_zip,
    site_address = EXCLUDED.site_address,
    city = EXCLUDED.city,
    state = EXCLUDED.state,
    zip = EXCLUDED.zip,
    legal_description = EXCLUDED.legal_description,
    land_value = EXCLUDED.land_value,
    improvement_value = EXCLUDED.improvement_value,
    market_value = EXCLUDED.market_value,
    assessed_value = EXCLUDED.assessed_value,
    sale_year = EXCLUDED.sale_year,
    sale_date = EXCLUDED.sale_date,
    sale_price = EXCLUDED.sale_price,
    tax_amount = EXCLUDED.tax_amount,
    flood_zone = EXCLUDED.flood_zone,
    raw_payload = EXCLUDED.raw_payload,
    imported_at = now();
COMMIT;
SELECT COUNT(*) FROM property.parcel_assessor_enrichment WHERE parish = 'East Baton Rouge';
`;
}

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  const metadata = await fetchJson<ArcgisMetadata>(`${SOURCE_URI}?f=json`);
  const countPayload = await fetchJson<ArcgisQueryResponse>(
    buildQueryUrl({ where: "1=1", returnCountOnly: true, f: "json" }),
  );
  const expected = countPayload.count ?? 0;
  const maxRecordCount = Math.max(1, Math.min(options.batchSize, metadata.maxRecordCount ?? options.batchSize));
  const targetRows = options.maxRows ? Math.min(expected, options.maxRows) : expected;
  let loaded = 0;
  let skipped = 0;

  if (!options.apply) {
    console.log(
      `[ebr-tax-enrichment] Dry run: ${SOURCE_NAME} has ${expected} rows; would fetch ${targetRows}. Re-run with --apply to upsert.`,
    );
    return;
  }

  runRemotePsql(readFileSync(SCHEMA_SQL_PATH, "utf8"));

  for (let offset = 0; offset < targetRows; offset += maxRecordCount) {
    const pageSize = Math.min(maxRecordCount, targetRows - offset);
    const page = await fetchJson<ArcgisQueryResponse>(
      buildQueryUrl({
        where: "1=1",
        outFields: TAX_PARCEL_FIELDS,
        returnGeometry: false,
        f: "json",
        resultOffset: offset,
        resultRecordCount: pageSize,
      }),
    );
    const rows = uniqueRows((page.features ?? [])
      .map(toRow)
      .filter((row): row is EnrichmentRow => {
        if (row) return true;
        skipped += 1;
        return false;
      }));
    if (rows.length > 0) {
      runRemotePsql(buildUploadSql(rows));
      loaded += rows.length;
    }
    console.log(`[ebr-tax-enrichment] upserted ${Math.min(offset + pageSize, targetRows)}/${targetRows}`);
  }

  console.log(
    JSON.stringify({ ok: true, parish: PARISH, expected, targetRows, loaded, skipped, sourceName: SOURCE_NAME }),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
