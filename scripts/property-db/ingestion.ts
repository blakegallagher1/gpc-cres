import "dotenv/config";

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const INGESTION_SQL_PATH = "infra/sql/property-db-ingestion-v1.sql";
const DEFAULT_CONTAINER = "entitlement-os-postgres";
const DEFAULT_DATABASE = "entitlement_os";
const DEFAULT_USER = "postgres";

type CliOptions = {
  command: string;
  importRunId?: string;
  parish?: string;
  sourceName?: string;
  sourceUri?: string;
  sourceSha256?: string;
  expectedRowCount?: string;
  apply: boolean;
};

function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : fallback;
}

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function parseCli(): CliOptions {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command) {
    throw new Error("Usage: property-db:ingestion <apply-contract|create-run|validate|promote|smoke> [options]");
  }
  return {
    command,
    importRunId: argValue(args, "--run-id"),
    parish: argValue(args, "--parish"),
    sourceName: argValue(args, "--source-name"),
    sourceUri: argValue(args, "--source-uri"),
    sourceSha256: argValue(args, "--source-sha256"),
    expectedRowCount: argValue(args, "--expected-row-count"),
    apply: args.includes("--apply"),
  };
}

function sqlLiteral(value: string | undefined): string {
  if (value === undefined) {
    return "NULL";
  }
  return `'${value.replace(/'/g, "''")}'`;
}

function required(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`Missing ${label}.`);
  }
  return value;
}

function run(command: string, args: string[], input?: string): string {
  return execFileSync(command, args, {
    encoding: "utf8",
    input,
    stdio: input ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
  }).trim();
}

function runRemotePsql(sql: string): string {
  const host = optionalEnv("PROPERTY_DB_SSH_HOST", "bg");
  const container = optionalEnv("PROPERTY_DB_CONTAINER", DEFAULT_CONTAINER);
  const database = optionalEnv("PROPERTY_DB_NAME", DEFAULT_DATABASE);
  const user = optionalEnv("PROPERTY_DB_USER", DEFAULT_USER);
  return run("ssh", [
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
  ], sql);
}

function runLocal(command: string, args: string[]): void {
  execFileSync(command, args, { stdio: "inherit" });
}

function createRun(options: CliOptions): void {
  const importRunId = required(options.importRunId, "--run-id");
  const parish = required(options.parish, "--parish");
  const sourceName = required(options.sourceName, "--source-name");
  const expectedRowCount = options.expectedRowCount ?? "NULL";
  const sql = `
INSERT INTO property.import_runs (
  import_run_id,
  source_name,
  source_uri,
  source_sha256,
  parish,
  expected_row_count,
  status
)
VALUES (
  ${sqlLiteral(importRunId)},
  ${sqlLiteral(sourceName)},
  ${sqlLiteral(options.sourceUri)},
  ${sqlLiteral(options.sourceSha256)},
  ${sqlLiteral(parish)},
  ${expectedRowCount},
  'staged'
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
    promoted_row_count = NULL;
SELECT jsonb_build_object('ok', true, 'importRunId', ${sqlLiteral(importRunId)})::text;
`;
  console.log(runRemotePsql(sql));
}

function validateRun(options: CliOptions): void {
  const importRunId = required(options.importRunId, "--run-id");
  console.log(runRemotePsql(`SELECT property.validate_parcel_import(${sqlLiteral(importRunId)})::text;`));
}

function promoteRun(options: CliOptions): void {
  const importRunId = required(options.importRunId, "--run-id");
  const sql = options.apply
    ? `SELECT property.promote_parcel_import(${sqlLiteral(importRunId)})::text;`
    : `BEGIN; SELECT property.promote_parcel_import(${sqlLiteral(importRunId)})::text; ROLLBACK;`;
  console.log(runRemotePsql(sql));
  if (options.apply) {
    runLocal("pnpm", ["property-db:contract:smoke"]);
    runLocal("pnpm", ["property-db:backup"]);
  }
}

function smoke(): void {
  const importRunId = `smoke-${Date.now()}`;
  const sql = `
BEGIN;
INSERT INTO property.import_runs (import_run_id, source_name, parish, expected_row_count, status)
VALUES (${sqlLiteral(importRunId)}, 'contract-smoke', 'East Baton Rouge', 1, 'staged');

INSERT INTO staging.parcels_import_rows (
  import_run_id,
  source_row_number,
  parcel_id,
  address,
  area_sqft,
  owner,
  assessed_value,
  geom,
  zoning_type,
  existing_land_use,
  future_land_use,
  parish,
  acreage,
  flood_zone,
  centroid,
  zip,
  raw_payload
)
SELECT
  ${sqlLiteral(importRunId)},
  1,
  parcel_id,
  address,
  area_sqft,
  owner,
  assessed_value,
  geom,
  zoning_type,
  existing_land_use,
  future_land_use,
  parish,
  acreage,
  flood_zone,
  centroid,
  zip,
  jsonb_build_object('smoke', true)
FROM public.ebr_parcels
WHERE parish = 'East Baton Rouge'
  AND geom IS NOT NULL
LIMIT 1;

SELECT property.validate_parcel_import(${sqlLiteral(importRunId)})::text;
SELECT property.promote_parcel_import(${sqlLiteral(importRunId)})::text;
ROLLBACK;
`;
  console.log(runRemotePsql(sql));
}

function applyContract(): void {
  runRemotePsql(readFileSync(INGESTION_SQL_PATH, "utf8"));
  console.log("[property-db-ingestion] applied property-db-ingestion-v1");
}

function main(): void {
  const options = parseCli();
  switch (options.command) {
    case "apply-contract":
      applyContract();
      return;
    case "create-run":
      createRun(options);
      return;
    case "validate":
      validateRun(options);
      return;
    case "promote":
      promoteRun(options);
      return;
    case "smoke":
      smoke();
      return;
    default:
      throw new Error(`Unknown ingestion command: ${options.command}`);
  }
}

try {
  main();
} catch (error: unknown) {
  console.error(`[property-db-ingestion] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
