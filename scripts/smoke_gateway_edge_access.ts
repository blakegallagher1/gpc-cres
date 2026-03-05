import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

/**
 * Edge smoke matrix for Cloudflare Access-protected gateway.
 *
 * Validates policy behavior in two modes:
 * - without CF Access headers (expected edge block)
 * - with CF Access headers (expected pass-through to origin)
 *
 * Usage:
 *   pnpm exec tsx scripts/smoke_gateway_edge_access.ts
 *
 * Required env:
 *   LOCAL_API_KEY
 *   CF_ACCESS_CLIENT_ID
 *   CF_ACCESS_CLIENT_SECRET
 *
 * Optional env:
 *   LOCAL_API_URL (default: https://api.gallagherpropco.com)
 */

type SmokeMode = "without_access" | "with_access";

type Endpoint = {
  appPath: string;
  gatewayPath: string;
  method: "GET" | "POST";
  body?: Record<string, unknown>;
};

type EndpointResult = {
  appPath: string;
  method: string;
  gatewayPath: string;
  status: number;
  ok: boolean;
  cloudflareBlocked: boolean;
  bodyPreview: string;
};

type ModeReport = {
  mode: SmokeMode;
  expected: string;
  results: EndpointResult[];
};

const CLOUDFLARE_BLOCK_SIGNATURE = "Forbidden. You don't have permission to view this.";

function readEnvValue(key: string): string | undefined {
  const runtime = process.env[key]?.trim();
  if (runtime) return runtime;

  const envFiles = [".env", ".env.local", path.join("apps", "web", ".env.local")];
  for (const file of envFiles) {
    const absPath = path.resolve(process.cwd(), file);
    if (!fs.existsSync(absPath)) continue;
    const parsed = dotenv.parse(fs.readFileSync(absPath));
    const value = parsed[key]?.trim();
    if (value) return value;
  }

  return undefined;
}

function isCloudflareAccessBlock(status: number, body: string): boolean {
  if (status !== 403) return false;
  return body.includes(CLOUDFLARE_BLOCK_SIGNATURE) || body.includes('"aud":"');
}

const baseUrl = (process.env.LOCAL_API_URL?.trim() || "https://api.gallagherpropco.com").replace(
  /\/$/,
  "",
);
const localApiKey = readEnvValue("LOCAL_API_KEY");
const cfAccessClientId = readEnvValue("CF_ACCESS_CLIENT_ID");
const cfAccessClientSecret = readEnvValue("CF_ACCESS_CLIENT_SECRET");

if (!localApiKey) {
  throw new Error("Missing LOCAL_API_KEY");
}
if (!cfAccessClientId || !cfAccessClientSecret) {
  throw new Error("Missing CF_ACCESS_CLIENT_ID or CF_ACCESS_CLIENT_SECRET");
}

// Maps app-side paths to the downstream gateway paths they hit.
const endpoints: Endpoint[] = [
  { appPath: "/api/deals", method: "GET", gatewayPath: "/deals" },
  { appPath: "/api/deals/[id]", method: "GET", gatewayPath: "/deals/non-existent-id" },
  {
    appPath: "/api/parcels",
    method: "GET",
    gatewayPath: "/api/parcels/search?q=highland&limit=1",
  },
  {
    appPath: "/api/places/autocomplete",
    method: "POST",
    gatewayPath: "/tools/parcels.search",
    body: { q: "highland", limit: 1 },
  },
  {
    appPath: "/api/map/prospect",
    method: "POST",
    gatewayPath: "/tools/parcels.sql",
    body: {
      query: "SELECT parcel_id, address FROM ebr_parcels LIMIT 1",
      params: [],
    },
  },
  {
    appPath: "/api/map/comps (compat)",
    method: "POST",
    gatewayPath: "/property-db/rpc/rpc_get_comparable_sales",
    body: {},
  },
  {
    appPath: "/api/map/tiles/[z]/[x]/[y]",
    method: "GET",
    gatewayPath: "/tiles/12/1042/1533.pbf",
  },
  {
    appPath: "/api/external/chatgpt-apps/parcel-geometry",
    method: "GET",
    gatewayPath: "/api/parcels/007-3904-9/geometry?detail_level=low",
  },
  {
    appPath: "tool:search_parcels",
    method: "POST",
    gatewayPath: "/tools/parcels.search",
    body: { owner_contains: "LLC", limit: 1 },
  },
  {
    appPath: "tool:get_parcel_details",
    method: "POST",
    gatewayPath: "/tools/parcel.lookup",
    body: { parcelId: "007-3904-9" },
  },
  {
    appPath: "tool:query_property_db_sql",
    method: "POST",
    gatewayPath: "/tools/parcels.sql",
    body: {
      query: "SELECT parcel_uid, situs_address FROM ebr_parcels LIMIT 1",
      params: [],
    },
  },
  {
    appPath: "tool:screen_flood",
    method: "POST",
    gatewayPath: "/api/screening/flood",
    body: { parcelId: "007-3904-9" },
  },
  {
    appPath: "tool:screen_soils",
    method: "POST",
    gatewayPath: "/api/screening/soils",
    body: { parcelId: "007-3904-9" },
  },
  {
    appPath: "tool:screen_wetlands",
    method: "POST",
    gatewayPath: "/api/screening/wetlands",
    body: { parcelId: "007-3904-9" },
  },
  {
    appPath: "tool:screen_epa",
    method: "POST",
    gatewayPath: "/api/screening/epa",
    body: { parcelId: "007-3904-9" },
  },
  {
    appPath: "tool:screen_traffic",
    method: "POST",
    gatewayPath: "/api/screening/traffic",
    body: { parcelId: "007-3904-9" },
  },
  {
    appPath: "tool:screen_ldeq",
    method: "POST",
    gatewayPath: "/api/screening/ldeq",
    body: { parcelId: "007-3904-9" },
  },
  {
    appPath: "tool:screen_full",
    method: "POST",
    gatewayPath: "/api/screening/full",
    body: { parcelId: "007-3904-9" },
  },
  { appPath: "admin policy check", method: "GET", gatewayPath: "/admin/health" },
  { appPath: "gateway health", method: "GET", gatewayPath: "/health" },
];

async function runRequest(mode: SmokeMode, endpoint: Endpoint): Promise<EndpointResult> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${localApiKey}`,
  };

  if (mode === "with_access") {
    headers["CF-Access-Client-Id"] = cfAccessClientId!;
    headers["CF-Access-Client-Secret"] = cfAccessClientSecret!;
  }

  if (endpoint.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${baseUrl}${endpoint.gatewayPath}`, {
    method: endpoint.method,
    headers,
    body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
    cache: "no-store",
  });

  const rawBody = await response.text();
  const bodyPreview = rawBody.replace(/\s+/g, " ").slice(0, 220);

  return {
    appPath: endpoint.appPath,
    method: endpoint.method,
    gatewayPath: endpoint.gatewayPath,
    status: response.status,
    ok: response.ok,
    cloudflareBlocked: isCloudflareAccessBlock(response.status, rawBody),
    bodyPreview,
  };
}

async function runMode(mode: SmokeMode): Promise<ModeReport> {
  const expected =
    mode === "without_access"
      ? "Every endpoint should be blocked by Cloudflare Access (403 + block signature)."
      : "Every endpoint should pass edge auth and reach origin policy/business logic.";

  const results: EndpointResult[] = [];
  for (const endpoint of endpoints) {
    results.push(await runRequest(mode, endpoint));
  }

  return { mode, expected, results };
}

function printReport(report: ModeReport): void {
  console.log(`\n=== ${report.mode} ===`);
  console.log(`expected: ${report.expected}`);
  for (const result of report.results) {
    console.log(
      `${result.method} ${result.gatewayPath} [${result.appPath}] -> ${result.status} (${result.ok ? "ok" : "not_ok"}; cf_blocked=${result.cloudflareBlocked}) :: ${result.bodyPreview}`,
    );
  }
}

function validateWithoutAccess(report: ModeReport): string[] {
  return report.results
    .filter((result) => !result.cloudflareBlocked)
    .map(
      (result) =>
        `without_access expected Cloudflare block but got status=${result.status} on ${result.method} ${result.gatewayPath} [${result.appPath}]`,
    );
}

function validateWithAccess(report: ModeReport): string[] {
  return report.results
    .filter((result) => result.cloudflareBlocked)
    .map(
      (result) =>
        `with_access should pass edge auth but still appears Cloudflare-blocked on ${result.method} ${result.gatewayPath} [${result.appPath}]`,
    );
}

async function main(): Promise<void> {
  console.log(`[edge-smoke] baseUrl=${baseUrl}`);
  const withoutAccess = await runMode("without_access");
  const withAccess = await runMode("with_access");

  printReport(withoutAccess);
  printReport(withAccess);

  const failures = [
    ...validateWithoutAccess(withoutAccess),
    ...validateWithAccess(withAccess),
  ];

  if (failures.length > 0) {
    console.error("\n[edge-smoke] FAIL");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("\n[edge-smoke] PASS: edge policy behavior verified for all matrix endpoints.");
}

void main();
