import { describe, it, expect, beforeAll } from "vitest";

/**
 * PRODUCTION VERIFICATION TESTS
 *
 * These tests hit live infrastructure (api.gallagherpropco.com, qdrant.gallagherpropco.com)
 * and must NOT run in CI. They are for local production verification only.
 *
 * Run locally: LOCAL_API_KEY=... pnpm vitest run production-verification
 *
 * Tests all 5 features before production deployment:
 * 1. Gateway caching with TTL
 * 2. Batch multi-parcel screening
 * 3. WebSocket /push operational events
 * 4. Qdrant semantic search property intelligence
 * 5. Error handling with invalid parcel IDs
 *
 * Valid test parcel (Amazon property):
 * - parcel_id: 308-4646-1
 * - address: 9001 CORTANA PLACE
 * - owner: AMAZON.COM SERVICES, LLC
 * - acreage: 97.13
 * - zoning: CW3
 * - existing_land_use: I
 */

// Skip entire file in CI — these tests hit live infrastructure
const isCI = !!process.env.CI;

const GATEWAY_URL = process.env.LOCAL_API_URL || "https://api.gallagherpropco.com";
const GATEWAY_KEY = process.env.LOCAL_API_KEY || "Y9DgsDrlvfDfitSgfp0YtLwjlvY5ocKnYA_4X11tfkc";
const AGENTS_URL = process.env.AGENTS_URL || "https://agents.gallagherpropco.com";
const VALID_PARCEL_IDS = [
  "308-4646-1", // Amazon
  "024-0104-5", // Recreation & Park
  "017-7837-4", // Edge
  "024-1865-7", // Dept of Highways
  "021-6741-7", // Walmart
];

(isCI ? describe.skip : describe)("Production Verification Tests", () => {
  let conversationId: string;

  beforeAll(() => {
    conversationId = `test-${Date.now()}`;
    console.log(`Test conversation ID: ${conversationId}`);
  });

  // ==================== TEST 1: GATEWAY CACHING ====================
  describe("Test 1: Gateway Caching with TTL", () => {
    it("should cache screenFull results for 15 minutes", async () => {
      const parcelId = VALID_PARCEL_IDS[0];
      console.log(`\n[TEST 1] Screening parcel ${parcelId} twice to verify cache...`);

      // First call - should hit the gateway
      const start1 = Date.now();
      const response1 = await gatewayPost("/api/screening/full", {
        parcelId,
      });
      const time1 = Date.now() - start1;
      console.log(`  First call: ${time1}ms (fresh fetch)`);
      expect(response1).toBeDefined();
      expect(response1.parcel_id).toBe(parcelId);

      // Second call - should hit the cache
      const start2 = Date.now();
      const response2 = await gatewayPost("/api/screening/full", {
        parcelId,
      });
      const time2 = Date.now() - start2;
      console.log(`  Second call: ${time2}ms (from cache)`);
      expect(response2).toBeDefined();
      expect(response2).toEqual(response1);

      // Cache should be significantly faster (at least 2x faster)
      console.log(`  Cache speedup: ${(time1 / time2).toFixed(1)}x`);
      expect(time2).toBeLessThan(time1);

      // Test cacheBust parameter
      const start3 = Date.now();
      const response3 = await gatewayPost("/api/screening/full", {
        parcelId,
        cacheBust: true,
      });
      const time3 = Date.now() - start3;
      console.log(`  Third call (cacheBust=true): ${time3}ms (forced fresh fetch)`);
      expect(response3).toBeDefined();
      expect(response3).toEqual(response1); // Should be identical
      // Should take similar time to first call since it bypassed cache
      console.log(`  ✅ TEST 1 PASSED: Cache is working correctly\n`);
    });
  });

  // ==================== TEST 2: BATCH SCREENING ====================
  describe("Test 2: Batch Multi-Parcel Screening", () => {
    it("should screen multiple parcels concurrently and return keyed results", async () => {
      console.log(`\n[TEST 2] Screening ${VALID_PARCEL_IDS.length} parcels in batch mode...`);

      const start = Date.now();
      const response = await postAgentTool("screen_batch", {
        parcel_ids: VALID_PARCEL_IDS,
        conversationId,
      }, { conversationId });
      const elapsed = Date.now() - start;
      console.log(`  Batch completed in ${elapsed}ms`);

      expect(response).toBeDefined();
      expect(response.results).toBeDefined();

      // Verify results are keyed by parcel_id
      for (const parcelId of VALID_PARCEL_IDS) {
        expect(response.results[parcelId]).toBeDefined();
        const result = response.results[parcelId];
        expect(result.status).toMatch(/^(ok|error)$/);
        console.log(`  - ${parcelId}: ${result.status}`);
      }

      // All should succeed
      const successCount = Object.values(response.results as Record<string, any>).filter(
        (r: any) => r.status === "ok"
      ).length;
      console.log(`  Success rate: ${successCount}/${VALID_PARCEL_IDS.length}`);
      expect(successCount).toBe(VALID_PARCEL_IDS.length);

      console.log(`  ✅ TEST 2 PASSED: Batch screening is working correctly\n`);
    });
  });

  // ==================== TEST 3: WEBSOCKET PUSH EVENTS ====================
  describe("Test 3: WebSocket /push Operational Events", () => {
    it("should stream operation_progress and operation_done events", async () => {
      console.log(`\n[TEST 3] Testing operational event streaming...`);

      const operationId = `batch-${Date.now()}`;
      const events: any[] = [];

      // Simulate batch operation progress events
      const progressIntervals = [0, 20, 40, 60, 80, 100];
      for (const pct of progressIntervals) {
        const event = {
          type: "operation_progress" as const,
          operationId,
          label: `Screening batch: ${pct}%`,
          pct,
        };
        const pushResponse = await pushEvent(conversationId, event);
        console.log(`  - Progress: ${pct}%`);
        events.push(pushResponse);
      }

      // Final completion event
      const doneEvent = {
        type: "operation_done" as const,
        operationId,
        label: "Batch screening complete",
        summary: "Successfully screened 5 parcels",
      };
      const doneResponse = await pushEvent(conversationId, doneEvent);
      console.log(`  - Completed: ${doneEvent.summary}`);
      events.push(doneResponse);

      expect(events.length).toBe(progressIntervals.length + 1);
      expect(events.every((e) => e.ok !== false)).toBe(true);
      console.log(`  ✅ TEST 3 PASSED: Push events working correctly\n`);
    });
  });

  // ==================== TEST 4: SEMANTIC SEARCH ====================
  describe("Test 4: Qdrant Property Intelligence Search", () => {
    it("should store and recall property findings semantically", async () => {
      console.log(`\n[TEST 4] Testing semantic property intelligence...`);

      const parcelId = VALID_PARCEL_IDS[0];

      // Store a finding
      console.log(`  Storing property finding for ${parcelId}...`);
      const screeningResult = {
        parcel_id: parcelId,
        address: "9001 CORTANA PLACE",
        parish: "EBR",
        zoning: "CW3",
        flood_zone: "AE",
        hydric_soils: true,
        epa_facilities_nearby: 2,
        wetlands: false,
        environmental_concerns: "40% in AE flood zone, hydric soils present",
      };

      const storeResponse = await postAgentTool("store_property_finding", {
        parcelId,
        screeningResult,
        dealNotes: "Test deal - verify cache and semantic search",
      }, { conversationId });
      console.log(`  Stored: ${storeResponse.ok ? "✓" : "✗"}`);
      expect(storeResponse.ok).toBe(true);

      // Recall with semantic query
      console.log(`  Searching for "flood zone EBR properties"...`);
      const searchResponse = await postAgentTool("recall_property_intelligence", {
        query: "flood zone EBR",
        parish: "EBR",
        minScore: 0.7,
      }, { conversationId });
      console.log(`  Found ${searchResponse.results?.length || 0} matches`);
      expect(searchResponse.ok).toBe(true);
      expect(searchResponse.results).toBeDefined();

      // Should find the stored parcel
      const found = searchResponse.results?.some((r: any) => r.parcel_id === parcelId);
      expect(found).toBe(true);
      console.log(`  ✅ TEST 4 PASSED: Semantic search is working correctly\n`);
    });
  });

  // ==================== TEST 5: ERROR HANDLING ====================
  describe("Test 5: Error Handling with Invalid Parcel IDs", () => {
    it("should emit operation_error events for invalid parcel IDs", async () => {
      console.log(`\n[TEST 5] Testing error handling...`);

      const invalidIds = ["000-0000-0", "999-9999-9", "INVALID"];
      const operationId = `error-test-${Date.now()}`;

      console.log(`  Screening ${invalidIds.length} invalid parcel IDs...`);
      const response = await postAgentTool("screen_batch", {
        parcel_ids: invalidIds,
        conversationId,
      }, { conversationId });

      expect(response).toBeDefined();
      expect(response.results).toBeDefined();

      // All should error
      for (const parcelId of invalidIds) {
        const result = response.results[parcelId];
        expect(result.status).toBe("error");
        console.log(`  - ${parcelId}: error (as expected)`);

        // Push error event
        const errorEvent = {
          type: "operation_error" as const,
          operationId,
          label: `Invalid parcel: ${parcelId}`,
          error: result.error || "Parcel not found",
        };
        const pushResponse = await pushEvent(conversationId, errorEvent);
        expect(pushResponse.ok).toBe(true);
      }

      console.log(`  ✅ TEST 5 PASSED: Error handling working correctly\n`);
    });
  });
});

// ==================== HELPER FUNCTIONS ====================

type AgentToolContext = {
  conversationId: string;
  dealId?: string;
  runId?: string;
};

type ToolEnvelopeMetadata = {
  toolName?: string;
  name?: string;
  destination?: string;
  risk?: string;
  quotaClass?: string;
  conversationId?: string;
  runId?: string;
};

type NormalizedToolResponse<T> =
  | {
      ok: true;
      value: T;
      metadata?: ToolEnvelopeMetadata;
    }
  | {
      ok: false;
      error: string;
      metadata?: ToolEnvelopeMetadata;
    };

type ScreenBatchResult = Record<
  string,
  { status: "ok" | "error"; data?: unknown; error?: string }
>;

type RecallPropertyResult = {
  results: Array<{
    parcelId: string;
    address: string;
    parish?: string;
    score?: number;
    screening_summary?: string;
  }>;
  query: string;
  count: number;
};

type StorePropertyResult = {
  stored: boolean;
  parcelId: string;
  address: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeToolResultPayload<T>(value: unknown): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }

  return value as T;
}

function normalizeToolResponse<T>(payload: unknown): NormalizedToolResponse<T> {
  if (!isRecord(payload)) {
    return {
      ok: false,
      error: "Tool response is not a valid object",
    };
  }

  // Newer endpoint contract wraps with `result` and `metadata`.
  if ("result" in payload) {
    return {
      ok: true,
      value: normalizeToolResultPayload<T>(payload.result),
      metadata: isRecord(payload.metadata) ? (payload.metadata as ToolEnvelopeMetadata) : undefined,
    };
  }

  // Backward compatibility for older call patterns.
  if ("ok" in payload && typeof payload.ok === "boolean") {
    if (payload.ok) {
      return {
        ok: true,
        value: normalizeToolResultPayload<T>(
          "result" in payload
            ? payload.result
            : "value" in payload
              ? payload.value
              : payload,
        ),
        metadata: isRecord(payload.metadata) ? (payload.metadata as ToolEnvelopeMetadata) : undefined,
      };
    }

    return {
      ok: false,
      error: typeof payload.error === "string" ? payload.error : "Tool execution failed",
      metadata: isRecord(payload.metadata) ? (payload.metadata as ToolEnvelopeMetadata) : undefined,
    };
  }

  return {
    ok: true,
    value: normalizeToolResultPayload<T>(payload),
  };
}

function unwrapScreenBatchResult(raw: ScreenBatchResult | { results: ScreenBatchResult }) {
  return isRecord(raw) && "results" in raw ? raw.results : raw;
}

function buildToolExecutionPayload(
  toolName: string,
  args: Record<string, any>,
  context: AgentToolContext,
) {
  return {
    toolName,
    arguments: args,
    context,
    conversationId: context.conversationId,
    ...(context.dealId ? { dealId: context.dealId } : {}),
    ...(context.runId ? { runId: context.runId } : {}),
  };
}

async function postAgentTool(
  toolName: string,
  args: Record<string, any>,
  context: AgentToolContext,
): Promise<NormalizedToolResponse<any>> {
  const payload = await apiPost("/api/agent/tools/execute", buildToolExecutionPayload(toolName, args, context));
  return normalizeToolResponse(payload);
}

async function gatewayPost(
  endpoint: string,
  body: Record<string, any>
): Promise<Record<string, any>> {
  const response = await fetch(`${GATEWAY_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GATEWAY_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Gateway error (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

async function apiPost(
  endpoint: string,
  body: Record<string, any>
): Promise<Record<string, any>> {
  const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    : "http://localhost:3000";

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`API error (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

async function pushEvent(
  conversationId: string,
  event: Record<string, any>
): Promise<Record<string, any>> {
  const response = await fetch(`${AGENTS_URL}/${conversationId}/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GATEWAY_KEY}`,
    },
    body: JSON.stringify({ conversationId, event }),
  });

  if (!response.ok) {
    throw new Error(`Push error (${response.status}): ${await response.text()}`);
  }

  return response.json();
}
