import "dotenv/config";

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type ArcgisSource = {
  parish: string;
  slug: string;
  sourceName: string;
  layerUrl: string;
  quality: "strong" | "verify" | "candidate";
  parcelIdFields: string[];
  addressFields: string[];
  addressPartFields?: string[];
  ownerFields: string[];
  assessedValueFields: string[];
  areaSqftFields: string[];
  acreageFields: string[];
  landUseFields: string[];
  zoningFields: string[];
  floodZoneFields: string[];
  zipFields: string[];
};

type CliOptions = {
  parish: string;
  applyPromote: boolean;
  batchSize: number;
  outputDir: string;
  maxRows: number | null;
};

type GeoJsonFeature = {
  type: "Feature";
  id?: string | number;
  geometry: { type: string; coordinates: unknown } | null;
  properties: Record<string, unknown> | null;
};

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

type ArcgisMetadata = {
  maxRecordCount?: number;
  objectIdField?: string;
  fields?: { name?: string; alias?: string; type?: string }[];
};

type ImportRow = {
  sourceRowNumber: number;
  parcelId: string;
  address: string | null;
  areaSqft: number | null;
  acreage: number | null;
  owner: string | null;
  assessedValue: number | null;
  geomGeojson: string;
  zoningType: string | null;
  existingLandUse: string | null;
  floodZone: string | null;
  zip: string | null;
  rawPayload: string;
};

const DEFAULT_BATCH_SIZE = 2000;
const DEFAULT_OUTPUT_DIR = "output/parcel-harvest";
const INGESTION_SQL_PATH = "infra/sql/property-db-ingestion-v1.sql";
const SOURCE_MANIFEST: ArcgisSource[] = [
  {
    parish: "East Baton Rouge",
    slug: "east-baton-rouge",
    sourceName: "EBR Assessor Tax Parcel ArcGIS REST",
    layerUrl: "https://maps.brla.gov/gis/rest/services/Cadastral/Tax_Parcel/MapServer/0",
    quality: "strong",
    parcelIdFields: ["prono", "assessment_num", "parcel_id", "parcelid", "parcelno", "parcel_num", "parcelnumb", "pin"],
    addressFields: ["physical_address", "address", "site_address", "situs_address", "property_address", "location"],
    ownerFields: ["owner", "owner_name", "ownername", "taxpayer", "taxpayer_name"],
    assessedValueFields: ["sum_assessed_value", "assessed_value", "total_assessment", "total_assessed", "assessedval"],
    areaSqftFields: ["area_sqft"],
    acreageFields: ["acreage", "acres"],
    landUseFields: ["existing_land_use", "land_use", "landuse", "property_class", "class"],
    zoningFields: ["zoning_type", "zoning", "zone"],
    floodZoneFields: ["flood_zone", "floodzone"],
    zipFields: ["zip", "zipcode", "site_zip", "situs_zip"],
  },
  {
    parish: "Orleans",
    slug: "orleans",
    sourceName: "New Orleans Assessor Landbase Parcels ArcGIS REST",
    layerUrl: "https://maps.nola.gov/server/rest/services/Assessor/Landbase_Layers/MapServer/0",
    quality: "strong",
    parcelIdFields: ["parcel_id", "parcelid", "parcel", "pin", "lot", "objectid"],
    addressFields: ["address", "site_address", "situs_address", "location", "full_address"],
    ownerFields: ["owner", "owner_name", "ownername", "taxpayer"],
    assessedValueFields: ["assessed_value", "total_assessment", "assessment", "assessedval"],
    areaSqftFields: ["area_sqft"],
    acreageFields: ["acreage", "acres"],
    landUseFields: ["land_use", "landuse", "property_class", "class"],
    zoningFields: ["zoning", "zone", "zoning_type"],
    floodZoneFields: ["flood_zone", "floodzone"],
    zipFields: ["zip", "zipcode"],
  },
  {
    parish: "Terrebonne",
    slug: "terrebonne",
    sourceName: "Terrebonne Assessor Parcel ArcGIS REST",
    layerUrl: "https://gis.tpcg.org/server/rest/services/Assessor/Parcel/FeatureServer/0",
    quality: "strong",
    parcelIdFields: ["parcel_id", "parcelid", "parcel_no", "parcelno", "assessment"],
    addressFields: ["address", "site_address", "situs_address", "physical_address", "location"],
    ownerFields: ["owner", "owner_name", "ownername"],
    assessedValueFields: ["assessed_value", "assessment", "total_assessed"],
    areaSqftFields: ["area_sqft"],
    acreageFields: ["acreage", "acres"],
    landUseFields: ["land_use", "landuse", "class", "property_class"],
    zoningFields: ["zoning", "zone", "zoning_type"],
    floodZoneFields: ["flood_zone", "floodzone"],
    zipFields: ["zip", "zipcode"],
  },
  {
    parish: "Acadia",
    slug: "acadia",
    sourceName: "Acadia Tax Parcel CAMA Joined View ArcGIS REST",
    layerUrl: "https://services3.arcgis.com/cWVjJ3EL88oVeYPk/arcgis/rest/services/Tax_Parcel_CAMA_Joined_View/FeatureServer/0",
    quality: "strong",
    parcelIdFields: ["parcel_no", "parcel_id", "parcelid", "parcelno", "pin", "assessment_no"],
    addressFields: ["par_address", "address", "site_address", "situs_address", "property_address", "mailing_address"],
    ownerFields: ["owners", "primary_owner", "taxpayer_name", "owner", "owner_name", "ownername"],
    assessedValueFields: ["assessed_value", "total_assessed", "assessment"],
    areaSqftFields: ["area_sqft"],
    acreageFields: ["acreage", "acres"],
    landUseFields: ["occupancy", "land_use", "landuse", "class", "property_class"],
    zoningFields: ["zoning", "zone", "zoning_type"],
    floodZoneFields: ["flood_zone", "floodzone"],
    zipFields: ["zip", "zipcode"],
  },
  {
    parish: "Ascension",
    slug: "ascension",
    sourceName: "Ascension Parish Tax Parcels ArcGIS REST",
    layerUrl: "https://services6.arcgis.com/1fGAZVgZnPx4zcNH/arcgis/rest/services/Ascension_Parish_Tax_Parcels/FeatureServer/0",
    quality: "strong",
    parcelIdFields: ["parcel_id", "parcelid", "parcel_no", "parcelno", "parcel", "assessment", "pin"],
    addressFields: ["address", "site_address", "situs_address", "property_address", "location_a"],
    addressPartFields: ["location_s", "location_1", "location_c"],
    ownerFields: ["owner", "owner_name", "ownername"],
    assessedValueFields: ["assmt_tota", "assessed_value", "total_assessed"],
    areaSqftFields: ["area_sqft"],
    acreageFields: ["parcelarea", "acreage", "acres"],
    landUseFields: ["propertyde", "land_use", "landuse", "class", "property_class"],
    zoningFields: ["zoning", "zone", "zoning_type"],
    floodZoneFields: ["ns_flood_d", "flood_zone", "floodzone"],
    zipFields: ["zip", "zipcode"],
  },
  {
    parish: "St. James",
    slug: "st-james",
    sourceName: "St. James Tax Parcels ArcGIS REST",
    layerUrl: "https://services7.arcgis.com/UgFir2NPOBP6GiJV/arcgis/rest/services/Tax_Parcels_View_2/FeatureServer/0",
    quality: "strong",
    parcelIdFields: ["pin", "parcel_id", "parcelid", "parcel_no", "parcelno", "assessment"],
    addressFields: ["physical_a", "owner_addr", "address", "site_address", "situs_address", "property_address"],
    ownerFields: ["taxpayer", "owner", "owner_name", "ownername", "contact"],
    assessedValueFields: ["assessed_v", "assessed_value", "total_assessed"],
    areaSqftFields: ["area_sqft"],
    acreageFields: ["calc_acre", "acreage", "acres"],
    landUseFields: ["legal_desc", "land_use", "landuse", "class", "property_class"],
    zoningFields: ["zoning", "zone", "zoning_type"],
    floodZoneFields: ["flood_zone", "floodzone"],
    zipFields: ["owner_zip", "zip", "zipcode"],
  },
  {
    parish: "Assumption",
    slug: "assumption",
    sourceName: "Assumption Parish Parcels 2019 ArcGIS REST",
    layerUrl: "https://services6.arcgis.com/1fGAZVgZnPx4zcNH/arcgis/rest/services/Assumption_Parish_Parcels_2019/FeatureServer/0",
    quality: "verify",
    parcelIdFields: ["parcel_id", "parcelid", "parcel_no", "parcelno", "parcel", "assessment", "pin"],
    addressFields: ["address", "site_address", "situs_address", "property_address", "location"],
    ownerFields: ["owner", "owner_name", "ownername"],
    assessedValueFields: ["assessed_value", "total_assessed", "assessment"],
    areaSqftFields: ["area_sqft"],
    acreageFields: ["acreage", "acres"],
    landUseFields: ["land_use", "landuse", "class", "property_class"],
    zoningFields: ["zoning", "zone", "zoning_type"],
    floodZoneFields: ["flood_zone", "floodzone"],
    zipFields: ["zip", "zipcode"],
  },
  {
    parish: "St. John the Baptist",
    slug: "st-john-the-baptist",
    sourceName: "St. John the Baptist Parcels Fidelis ArcGIS REST",
    layerUrl: "https://services6.arcgis.com/1fGAZVgZnPx4zcNH/arcgis/rest/services/Fidelis/FeatureServer/7",
    quality: "verify",
    parcelIdFields: ["parcel_id", "parcelid", "parcel_no", "parcelno", "parcel", "assessment", "pin"],
    addressFields: ["address", "site_address", "situs_address", "property_address", "location"],
    ownerFields: ["owner", "owner_name", "ownername"],
    assessedValueFields: ["assessed_value", "total_assessed", "assessment"],
    areaSqftFields: ["area_sqft"],
    acreageFields: ["acreage", "acres"],
    landUseFields: ["land_use", "landuse", "class", "property_class"],
    zoningFields: ["zoning", "zone", "zoning_type"],
    floodZoneFields: ["flood_zone", "floodzone"],
    zipFields: ["zip", "zipcode"],
  },
  {
    parish: "West Baton Rouge",
    slug: "west-baton-rouge",
    sourceName: "West Baton Rouge Parcel Data Fidelis ArcGIS REST",
    layerUrl: "https://services6.arcgis.com/1fGAZVgZnPx4zcNH/arcgis/rest/services/Fidelis/FeatureServer/8",
    quality: "verify",
    parcelIdFields: ["assessorid", "parcelnumb", "parcel_id", "parcelid", "parcel_no", "parcelno"],
    addressFields: ["address", "aisaddress", "site_address", "situs_address", "property_address"],
    ownerFields: ["owner_name", "aisname", "owner", "ownername"],
    assessedValueFields: ["aisassesse", "assessed_value", "total_assessed"],
    areaSqftFields: ["area_sqft"],
    acreageFields: ["acreage", "acres"],
    landUseFields: ["legal_desc", "aislegalde", "subdivisio", "land_use", "landuse", "class", "property_class"],
    zoningFields: ["zoning", "zone", "zoning_type"],
    floodZoneFields: ["flood_zone", "floodzone"],
    zipFields: ["zip", "zipcode"],
  },
  {
    parish: "St. Tammany",
    slug: "st-tammany",
    sourceName: "2022 STPAO Certified Parcels ArcGIS REST",
    layerUrl: "https://services8.arcgis.com/xqfvcYWRsxGrAkQR/arcgis/rest/services/2022_STPAO_Certified_Parcels/FeatureServer/4",
    quality: "verify",
    parcelIdFields: ["parcel_id", "parcelid", "parcel_no", "parcelno", "parcel", "assessment", "pin"],
    addressFields: ["address", "site_address", "situs_address", "property_address", "location"],
    ownerFields: ["owner", "owner_name", "ownername"],
    assessedValueFields: ["assessed_value", "total_assessed", "assessment"],
    areaSqftFields: ["area_sqft"],
    acreageFields: ["acreage", "acres"],
    landUseFields: ["land_use", "landuse", "class", "property_class"],
    zoningFields: ["zoning", "zone", "zoning_type"],
    floodZoneFields: ["flood_zone", "floodzone"],
    zipFields: ["zip", "zipcode"],
  },
  {
    parish: "Lafayette",
    slug: "lafayette",
    sourceName: "Lafayette TaxParcelPublic Assessor Map Service",
    layerUrl: "https://webgis.lafayetteassessor.com/arcgis/rest/services/Sidwell/TaxParcelPublic/MapServer/0",
    quality: "candidate",
    parcelIdFields: ["parcel_id", "parcelid", "parcel_no", "parcelno", "parcel", "assessment", "pin"],
    addressFields: ["address", "site_address", "situs_address", "property_address", "location"],
    ownerFields: ["owner", "owner_name", "ownername"],
    assessedValueFields: ["assessed_value", "total_assessed", "assessment"],
    areaSqftFields: ["area_sqft"],
    acreageFields: ["acreage", "acres"],
    landUseFields: ["land_use", "landuse", "class", "property_class"],
    zoningFields: ["zoning", "zone", "zoning_type"],
    floodZoneFields: ["flood_zone", "floodzone"],
    zipFields: ["zip", "zipcode"],
  },
];

function parseCli(args: string[]): CliOptions {
  const getValue = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
  const parish = getValue("--parish");
  if (!parish) {
    throw new Error(`Usage: pnpm parcel:harvest:la -- --parish "Ascension" [--apply-promote]`);
  }
  const maxRowsValue = getValue("--max-rows");
  return {
    parish,
    applyPromote: args.includes("--apply-promote"),
    batchSize: Math.max(100, Number(getValue("--batch-size") ?? DEFAULT_BATCH_SIZE)),
    outputDir: getValue("--output-dir") ?? DEFAULT_OUTPUT_DIR,
    maxRows: maxRowsValue ? Math.max(1, Number(maxRowsValue)) : null,
  };
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findSource(parish: string): ArcgisSource {
  const normalized = normalizeKey(parish);
  const source = SOURCE_MANIFEST.find(
    (candidate) => normalizeKey(candidate.parish) === normalized || normalizeKey(candidate.slug) === normalized,
  );
  if (!source) {
    const supported = SOURCE_MANIFEST.map((candidate) => candidate.parish).join(", ");
    throw new Error(`Unsupported parish "${parish}". Supported: ${supported}`);
  }
  return source;
}

function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : fallback;
}

function runRemotePsql(input: string): string {
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

function sqlLiteral(value: string | null): string {
  if (value === null) return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed ${response.status} ${response.statusText}: ${url}`);
  }
  return (await response.json()) as T;
}

function buildUrl(baseUrl: string, params: Record<string, string | number | boolean>): string {
  const url = new URL(`${baseUrl}/query`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function fieldMap(properties: Record<string, unknown>): Map<string, string> {
  const map = new Map<string, string>();
  for (const key of Object.keys(properties)) {
    map.set(normalizeKey(key), key);
  }
  return map;
}

function firstString(
  properties: Record<string, unknown>,
  fields: string[],
  fallbackFields: string[] = [],
): string | null {
  const fieldsByKey = fieldMap(properties);
  for (const candidate of [...fields, ...fallbackFields]) {
    const actual = fieldsByKey.get(normalizeKey(candidate));
    if (!actual) continue;
    const value = properties[actual];
    if (value === null || value === undefined) continue;
    const stringValue = String(value).trim();
    if (stringValue.length > 0) return stringValue;
  }
  return null;
}

function firstNumber(properties: Record<string, unknown>, fields: string[]): number | null {
  const fieldsByKey = fieldMap(properties);
  for (const candidate of fields) {
    const actual = fieldsByKey.get(normalizeKey(candidate));
    if (!actual) continue;
    const value = properties[actual];
    const normalized = String(value ?? "").replace(/[$,]/g, "");
    const parsed = typeof value === "number" ? value : Number(normalized.match(/-?\d+(?:\.\d+)?/)?.[0] ?? "");
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function joinedAddress(properties: Record<string, unknown>, fields: string[] | undefined): string | null {
  if (!fields || fields.length === 0) return null;
  const fieldsByKey = fieldMap(properties);
  const parts = fields
    .map((field) => {
      const actual = fieldsByKey.get(normalizeKey(field));
      const value = actual ? properties[actual] : null;
      return value === null || value === undefined ? "" : String(value).trim();
    })
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts.join(" ") : null;
}

function candidateMetadataFields(metadata: ArcgisMetadata, words: string[]): string[] {
  const fields = metadata.fields ?? [];
  return fields
    .filter((field) => {
      const haystack = normalizeKey(`${field.name ?? ""} ${field.alias ?? ""}`);
      return words.some((word) => haystack.includes(normalizeKey(word)));
    })
    .map((field) => field.name)
    .filter((field): field is string => Boolean(field));
}

function geometryAreaSqft(properties: Record<string, unknown>, source: ArcgisSource): number | null {
  const rawArea = firstNumber(properties, source.areaSqftFields);
  if (rawArea === null) return null;
  return Math.round(rawArea);
}

function toImportRow(
  feature: GeoJsonFeature,
  source: ArcgisSource,
  metadata: ArcgisMetadata,
  sourceRowNumber: number,
): ImportRow | null {
  if (!feature.geometry) return null;
  const properties = feature.properties ?? {};
  const fallbackParcelFields = [
    metadata.objectIdField,
    ...candidateMetadataFields(metadata, ["parcel", "pin", "assessment", "objectid"]),
  ].filter((field): field is string => Boolean(field));
  const parcelId = firstString(properties, source.parcelIdFields, fallbackParcelFields);
  if (!parcelId) return null;

  return {
    sourceRowNumber,
    parcelId,
    address:
      firstString(properties, source.addressFields, candidateMetadataFields(metadata, ["address", "situs"])) ??
      joinedAddress(properties, source.addressPartFields),
    areaSqft: geometryAreaSqft(properties, source),
    acreage: firstNumber(properties, source.acreageFields),
    owner: firstString(properties, source.ownerFields, candidateMetadataFields(metadata, ["owner"])),
    assessedValue: firstNumber(properties, source.assessedValueFields),
    geomGeojson: JSON.stringify(feature.geometry),
    zoningType: firstString(properties, source.zoningFields),
    existingLandUse: firstString(properties, source.landUseFields),
    floodZone: firstString(properties, source.floodZoneFields, candidateMetadataFields(metadata, ["flood"])),
    zip: firstString(properties, source.zipFields, candidateMetadataFields(metadata, ["zip"])),
    rawPayload: JSON.stringify({ id: feature.id ?? null, properties }),
  };
}

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const raw = String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

function buildUploadSql(importRunId: string, parish: string, rows: ImportRow[]): string {
  const header = [
    "source_row_number",
    "parcel_id",
    "address",
    "area_sqft",
    "acreage",
    "owner",
    "assessed_value",
    "geom_geojson",
    "zoning_type",
    "existing_land_use",
    "flood_zone",
    "zip",
    "raw_payload",
  ].join(",");
  const csvRows = rows.map((row) =>
    [
      row.sourceRowNumber,
      row.parcelId,
      row.address,
      row.areaSqft,
      row.acreage,
      row.owner,
      row.assessedValue,
      row.geomGeojson,
      row.zoningType,
      row.existingLandUse,
      row.floodZone,
      row.zip,
      row.rawPayload,
    ]
      .map(csvCell)
      .join(","),
  );

  return `
BEGIN;
DELETE FROM staging.parcels_import_rows WHERE import_run_id = ${sqlLiteral(importRunId)};
CREATE TEMP TABLE parcel_import_upload (
  source_row_number integer,
  parcel_id text,
  address text,
  area_sqft integer,
  acreage numeric,
  owner text,
  assessed_value numeric,
  geom_geojson text,
  zoning_type text,
  existing_land_use text,
  flood_zone text,
  zip text,
  raw_payload jsonb
) ON COMMIT DROP;
\\copy parcel_import_upload FROM STDIN WITH (FORMAT csv, HEADER true)
${header}
${csvRows.join("\n")}
\\.
INSERT INTO staging.parcels_import_rows (
  import_run_id,
  source_row_number,
  parcel_id,
  address,
  area_sqft,
  acreage,
  owner,
  assessed_value,
  geom,
  zoning_type,
  existing_land_use,
  parish,
  flood_zone,
  zip,
  raw_payload
)
SELECT
  ${sqlLiteral(importRunId)},
  source_row_number,
  parcel_id,
  NULLIF(address, ''),
  area_sqft,
  acreage,
  NULLIF(owner, ''),
  assessed_value,
  ST_SetSRID(ST_MakeValid(ST_GeomFromGeoJSON(geom_geojson)::geometry), 4326),
  NULLIF(zoning_type, ''),
  NULLIF(existing_land_use, ''),
  ${sqlLiteral(parish)},
  NULLIF(flood_zone, ''),
  NULLIF(zip, ''),
  raw_payload
FROM parcel_import_upload;
COMMIT;
SELECT COUNT(*) FROM staging.parcels_import_rows WHERE import_run_id = ${sqlLiteral(importRunId)};
`;
}

function createRunSql(source: ArcgisSource, importRunId: string, expectedRowCount: number, sourceSha256: string): string {
  return `
INSERT INTO property.import_runs (
  import_run_id,
  source_name,
  source_uri,
  source_sha256,
  parish,
  expected_row_count,
  status,
  notes
)
VALUES (
  ${sqlLiteral(importRunId)},
  ${sqlLiteral(source.sourceName)},
  ${sqlLiteral(source.layerUrl)},
  ${sqlLiteral(sourceSha256)},
  ${sqlLiteral(source.parish)},
  ${expectedRowCount},
  'staged',
  ${sqlLiteral(`quality=${source.quality}; harvested from public ArcGIS REST`)}
)
ON CONFLICT (import_run_id) DO UPDATE
SET source_name = EXCLUDED.source_name,
    source_uri = EXCLUDED.source_uri,
    source_sha256 = EXCLUDED.source_sha256,
    parish = EXCLUDED.parish,
    expected_row_count = EXCLUDED.expected_row_count,
    status = 'staged',
    validation_report = '{}'::jsonb,
    validated_at = NULL,
    promoted_at = NULL,
    promoted_row_count = NULL,
    notes = EXCLUDED.notes;
SELECT jsonb_build_object('ok', true, 'importRunId', ${sqlLiteral(importRunId)})::text;
`;
}

async function harvest(source: ArcgisSource, options: CliOptions): Promise<{ rows: ImportRow[]; sha256: string; expected: number }> {
  const metadata = await fetchJson<ArcgisMetadata>(`${source.layerUrl}?f=json`);
  const countPayload = await fetchJson<{ count?: number }>(
    buildUrl(source.layerUrl, { where: "1=1", returnCountOnly: true, f: "json" }),
  );
  const expected = countPayload.count ?? 0;
  const maxRecordCount = Math.max(1, Math.min(options.batchSize, metadata.maxRecordCount ?? options.batchSize));
  const targetRows = options.maxRows ? Math.min(expected, options.maxRows) : expected;
  const rows: ImportRow[] = [];
  const seenParcelIds = new Set<string>();
  const rawPages: GeoJsonFeatureCollection[] = [];
  let skipped = 0;
  let duplicateParcelIds = 0;

  for (let offset = 0; offset < targetRows; offset += maxRecordCount) {
    const pageSize = Math.min(maxRecordCount, targetRows - offset);
    const page = await fetchJson<GeoJsonFeatureCollection>(
      buildUrl(source.layerUrl, {
        where: "1=1",
        outFields: "*",
        returnGeometry: true,
        outSR: 4326,
        f: "geojson",
        resultOffset: offset,
        resultRecordCount: pageSize,
      }),
    );
    rawPages.push(page);
    for (const feature of page.features) {
      const row = toImportRow(feature, source, metadata, rows.length + skipped + 1);
      if (row) {
        const dedupeKey = normalizeKey(row.parcelId);
        if (seenParcelIds.has(dedupeKey)) {
          duplicateParcelIds += 1;
          continue;
        }
        seenParcelIds.add(dedupeKey);
        rows.push(row);
      } else {
        skipped += 1;
      }
    }
    console.log(`[parcel-harvest] ${source.parish}: fetched ${Math.min(offset + pageSize, targetRows)}/${targetRows}`);
  }

  const rawPayload = JSON.stringify({ metadata, pages: rawPages });
  const sha256 = createHash("sha256").update(rawPayload).digest("hex");
  const outputDir = path.resolve(process.cwd(), options.outputDir, source.slug);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, `${source.slug}-${sha256.slice(0, 12)}.json`), rawPayload);
  writeFileSync(
    path.join(outputDir, `${source.slug}-${sha256.slice(0, 12)}-summary.json`),
    JSON.stringify(
      { parish: source.parish, expected, stagedRows: rows.length, skipped, duplicateParcelIds, sha256 },
      null,
      2,
    ),
  );

  return { rows, sha256, expected: targetRows };
}

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  const source = findSource(options.parish);
  const importRunId = `la-${source.slug}-${new Date().toISOString().slice(0, 10)}`;

  runRemotePsql(readFileSync(INGESTION_SQL_PATH, "utf8"));
  const harvested = await harvest(source, options);
  if (harvested.rows.length === 0) {
    throw new Error(`[parcel-harvest] ${source.parish}: no importable rows harvested`);
  }

  console.log(runRemotePsql(createRunSql(source, importRunId, harvested.rows.length, harvested.sha256)));
  console.log(runRemotePsql(buildUploadSql(importRunId, source.parish, harvested.rows)));
  console.log(runRemotePsql(`SELECT property.validate_parcel_import(${sqlLiteral(importRunId)})::text;`));

  if (options.applyPromote) {
    console.log(runRemotePsql(`SELECT property.promote_parcel_import(${sqlLiteral(importRunId)})::text;`));
  } else {
    console.log(`[parcel-harvest] Staged and validated ${importRunId}. Re-run with --apply-promote to promote.`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
