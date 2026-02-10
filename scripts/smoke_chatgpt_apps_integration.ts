#!/usr/bin/env npx tsx
/**
 * Smoke tests for chatgpt-apps integration.
 *
 * Tests directly against chatgpt-apps Supabase to isolate the integration
 * layer (not through Next.js API routes).
 *
 * Env vars (all required):
 *   CHATGPT_APPS_SUPABASE_URL
 *   CHATGPT_APPS_SUPABASE_ANON_KEY     — passes Kong gateway
 *   CHATGPT_APPS_SUPABASE_EXT_JWT      — sets external_reader DB role
 *   SMOKE_TEST_PARCEL_ID               — a valid parcel UUID
 *   SMOKE_TEST_LAT                     — latitude for point lookup
 *   SMOKE_TEST_LNG                     — longitude for point lookup
 *   SMOKE_TEST_PARISH                  — parish name for point lookup
 *
 * Usage:
 *   npx tsx scripts/smoke_chatgpt_apps_integration.ts
 */

// ---------------------------------------------------------------------------
// Config from env
// ---------------------------------------------------------------------------

const URL = process.env.CHATGPT_APPS_SUPABASE_URL ?? "";
const ANON_KEY = process.env.CHATGPT_APPS_SUPABASE_ANON_KEY ?? "";
const EXT_JWT = process.env.CHATGPT_APPS_SUPABASE_EXT_JWT ?? "";
const PARCEL_ID = process.env.SMOKE_TEST_PARCEL_ID ?? "5b2cdc0a-4491-4e28-a272-2dc74e23d69c";
const LAT = parseFloat(process.env.SMOKE_TEST_LAT ?? "30.4515");
const LNG = parseFloat(process.env.SMOKE_TEST_LNG ?? "-91.1871");
const PARISH = process.env.SMOKE_TEST_PARISH ?? "East Baton Rouge";

if (!URL || !ANON_KEY || !EXT_JWT) {
  console.error(
    "Missing required env vars: CHATGPT_APPS_SUPABASE_URL, CHATGPT_APPS_SUPABASE_ANON_KEY, CHATGPT_APPS_SUPABASE_EXT_JWT",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, message: "OK", durationMs: Date.now() - start });
  } catch (err) {
    results.push({
      name,
      passed: false,
      message: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    });
  }
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

/** Call an RPC with the two-header auth pattern. */
async function rpcCall(
  functionName: string,
  body: Record<string, unknown>,
  headerOverrides?: { apikey?: string; authorization?: string },
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: headerOverrides?.apikey ?? ANON_KEY,
      Authorization: headerOverrides?.authorization ?? `Bearer ${EXT_JWT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    data = { _raw: text };
  }
  return { status: res.status, data };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {

// ---------------------------------------------------------------------------
// Test 1: rpc_get_parcel_geometry succeeds
// ---------------------------------------------------------------------------
await runTest("1. rpc_get_parcel_geometry — success", async () => {
  const { status, data } = await rpcCall("rpc_get_parcel_geometry", {
    parcel_id: PARCEL_ID,
    detail_level: "low",
  });
  assert(status === 200, `expected 200, got ${status}`);
  assert(Array.isArray(data.bbox), "bbox must be an array");
  assert(
    typeof data.centroid === "object" && data.centroid !== null,
    "centroid must be an object",
  );
  assert(typeof data.area_sqft === "number", "area_sqft must be a number");
  assert(typeof data.srid === "number", "srid must be a number");
  assert("geom_simplified" in data, "must include geom_simplified key");
  assert("dataset_version" in data, "must include dataset_version key");
});

// ---------------------------------------------------------------------------
// Test 2: rpc_get_parcel_dimensions succeeds
// ---------------------------------------------------------------------------
await runTest("2. rpc_get_parcel_dimensions — success", async () => {
  const { status, data } = await rpcCall("rpc_get_parcel_dimensions", {
    parcel_id: PARCEL_ID,
  });
  assert(status === 200, `expected 200, got ${status}`);
  assert(typeof data.width_ft === "number", "width_ft must be a number");
  assert(typeof data.depth_ft === "number", "depth_ft must be a number");
  assert(typeof data.area_sqft === "number", "area_sqft must be a number");
  assert(typeof data.frontage_ft === "number", "frontage_ft must be a number");
  assert(typeof data.confidence === "number", "confidence must be a number");
  assert(typeof data.method === "string", "method must be a string");
});

// ---------------------------------------------------------------------------
// Test 3: rpc_zoning_lookup succeeds
// ---------------------------------------------------------------------------
await runTest("3. rpc_zoning_lookup — success", async () => {
  const { status, data } = await rpcCall("rpc_zoning_lookup", {
    parcel_id: PARCEL_ID,
  });
  assert(status === 200, `expected 200, got ${status}`);
  assert(Array.isArray(data.zoning_codes), "zoning_codes must be an array");
  assert(typeof data.jurisdiction === "string", "jurisdiction must be a string");
  assert(Array.isArray(data.overlay), "overlay must be an array");
  assert("source" in data, "must include source key");
});

// ---------------------------------------------------------------------------
// Test 4: rpc_zoning_lookup_by_point succeeds
// ---------------------------------------------------------------------------
await runTest("4. rpc_zoning_lookup_by_point — success", async () => {
  const { status, data } = await rpcCall("rpc_zoning_lookup_by_point", {
    lat: LAT,
    lng: LNG,
    parish: PARISH,
  });
  assert(status === 200, `expected 200, got ${status}`);
  assert(Array.isArray(data.zoning_codes), "zoning_codes must be an array");
  assert(typeof data.jurisdiction === "string", "jurisdiction must be a string");
});

// ---------------------------------------------------------------------------
// Test 5: rpc_get_amenities_cache — cache miss
// ---------------------------------------------------------------------------
await runTest("5. rpc_get_amenities_cache — cache miss", async () => {
  const { status, data } = await rpcCall("rpc_get_amenities_cache", {
    cache_key: "smoke-test-nonexistent-key-" + Date.now(),
  });
  assert(status === 200, `expected 200, got ${status}`);
  assert(data.hit === false, `expected hit=false, got hit=${data.hit}`);
  assert(data.payload === null, `expected payload=null, got ${JSON.stringify(data.payload)}`);
});

// ---------------------------------------------------------------------------
// Test 6: amenities cache round-trip (upsert then get)
// ---------------------------------------------------------------------------
await runTest("6. amenities cache round-trip (upsert + get)", async () => {
  const cacheKey = `smoke-test-round-trip-${Date.now()}`;

  // Step A: upsert
  const upsert = await rpcCall("rpc_upsert_amenities_cache", {
    cache_key: cacheKey,
    payload: { test: true, ts: Date.now() },
    ttl_seconds: 60,
  });
  assert(upsert.status === 200, `upsert expected 200, got ${upsert.status}`);
  assert(upsert.data.ok === true, `upsert expected ok=true, got ${upsert.data.ok}`);
  assert(typeof upsert.data.expires_at === "string", "upsert must return expires_at");

  // Step B: get
  const get = await rpcCall("rpc_get_amenities_cache", { cache_key: cacheKey });
  assert(get.status === 200, `get expected 200, got ${get.status}`);
  assert(get.data.hit === true, `expected hit=true, got hit=${get.data.hit}`);
  assert(
    typeof get.data.payload === "object" && get.data.payload !== null,
    "payload must be an object",
  );
  const payload = get.data.payload as Record<string, unknown>;
  assert(payload.test === true, `expected payload.test=true, got ${payload.test}`);
});

// ---------------------------------------------------------------------------
// Test 7: Table access is denied
// ---------------------------------------------------------------------------
await runTest("7. table access denied (external_reader has no SELECT)", async () => {
  const res = await fetch(`${URL}/rest/v1/parcels?limit=1`, {
    method: "GET",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${EXT_JWT}`,
    },
  });
  // Expect 403 (permission denied) or 401
  assert(
    res.status === 403 || res.status === 401,
    `expected 403 or 401 for table access, got ${res.status}`,
  );
  const body = await res.text();
  assert(
    body.includes("permission denied") || body.includes("denied") || res.status === 401,
    `expected permission denied message, got: ${body.slice(0, 200)}`,
  );
});

// ---------------------------------------------------------------------------
// Test 8: Restricted JWT alone fails as apikey (Kong rejects)
// ---------------------------------------------------------------------------
await runTest("8. restricted JWT as apikey — Kong rejects with 401", async () => {
  const { status } = await rpcCall(
    "rpc_get_parcel_geometry",
    { parcel_id: PARCEL_ID, detail_level: "low" },
    { apikey: EXT_JWT, authorization: `Bearer ${EXT_JWT}` },
  );
  assert(status === 401, `expected 401 from Kong, got ${status}`);
});

// ---------------------------------------------------------------------------
// Test 9: Parcel not found
// ---------------------------------------------------------------------------
await runTest("9. error handling — parcel not found", async () => {
  const { status, data } = await rpcCall("rpc_get_parcel_geometry", {
    parcel_id: "00000000-0000-0000-0000-000000000000",
    detail_level: "low",
  });
  assert(status === 200, `expected 200, got ${status}`);
  assert(
    typeof data.error === "string" && data.error.toLowerCase().includes("not found"),
    `expected "not found" error, got: ${JSON.stringify(data)}`,
  );
});

// ---------------------------------------------------------------------------
// Test 10: Invalid coordinates
// ---------------------------------------------------------------------------
await runTest("10. error handling — invalid coordinates", async () => {
  const { status, data } = await rpcCall("rpc_zoning_lookup_by_point", {
    lat: 999,
    lng: 999,
    parish: "test",
  });
  assert(status === 200, `expected 200, got ${status}`);
  assert(
    typeof data.error === "string" && data.error.toLowerCase().includes("invalid"),
    `expected "invalid" error, got: ${JSON.stringify(data)}`,
  );
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log("\n" + "=".repeat(64));
console.log("  CHATGPT-APPS INTEGRATION SMOKE TEST RESULTS");
console.log("=".repeat(64));

let passed = 0;
let failed = 0;

for (const r of results) {
  const icon = r.passed ? "\u2705" : "\u274C";
  console.log(`  ${icon} ${r.name} (${r.durationMs}ms)${r.passed ? "" : `\n     ${r.message}`}`);
  if (r.passed) passed++;
  else failed++;
}

console.log("=".repeat(64));
console.log(`  Total: ${results.length}  |  Passed: ${passed}  |  Failed: ${failed}`);
console.log("=".repeat(64) + "\n");

if (failed > 0) process.exit(1);

} // end main

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
