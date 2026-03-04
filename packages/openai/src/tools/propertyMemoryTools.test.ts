/**
 * Memory System Diagnostic Tests
 *
 * Tests storage (store_property_finding) and retrieval (recall_property_intelligence)
 * to identify why agents cannot reliably persist and recall property intelligence.
 *
 * Key hypotheses tested:
 *   H1 — Feature flag AGENTOS_QDRANT_HYBRID_ENABLED is off by default
 *   H2 — Collection initialization fails silently before search
 *   H3 — RRF scores are always 0 / below minScore threshold
 *   H4 — Org-id filter mismatch between storage and retrieval
 *   H5 — Qdrant response shape mismatch (result.points vs result)
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// ── Module mocks ─────────────────────────────────────────────────────────────
// Must be hoisted before any imports that use these modules.

vi.mock("../agentos/config.js", () => ({
  getAgentOsConfig: vi.fn(),
  isAgentOsFeatureEnabled: vi.fn(),
}));

vi.mock("../agentos/utils/embedding.js", () => ({
  embedText: vi.fn(),
}));

vi.mock("../agentos/qdrant.js", () => ({
  buildHashedSparseVector: vi.fn(),
}));

// Make tool() a passthrough so .execute is directly callable in tests
vi.mock("@openai/agents", () => ({
  tool: <T extends object>(definition: T) => definition,
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────
import { getAgentOsConfig, isAgentOsFeatureEnabled } from "../agentos/config.js";
import { embedText } from "../agentos/utils/embedding.js";
import { buildHashedSparseVector } from "../agentos/qdrant.js";
import { PropertyIntelligenceStore } from "../agentos/memory/property.js";
import {
  store_property_finding,
  recall_property_intelligence,
} from "./propertyMemoryTools.js";

// ── Test constants ────────────────────────────────────────────────────────────
const TEST_ORG_ID = "00000000-0000-0000-0000-000000000001";
const TEST_PARCEL_ID = "parcel-abc-123";
const TEST_ADDRESS = "1234 Industrial Blvd, Baton Rouge, LA";
const TEST_PARISH = "East Baton Rouge";
const QDRANT_URL = "http://localhost:6333";
const COLLECTION = "property_intelligence";

const FAKE_DENSE_VECTOR = new Array(1536).fill(0.01);
const FAKE_SPARSE_VECTOR = { indices: [1, 5, 9], values: [0.3, 0.5, 0.2] };

/** Default Qdrant config returned by mocked getAgentOsConfig */
function makeConfig() {
  return {
    enabled: true,
    features: { qdrantHybridRetrieval: true },
    models: { embeddingDimensions: 1536 },
    qdrant: {
      url: QDRANT_URL,
      apiKey: null,
      collections: { propertyIntelligence: COLLECTION },
      denseVectorName: "dense",
      sparseVectorName: "bm25",
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return a fetch mock that responds with given status/body for each call in order. */
function makeFetchSequence(
  responses: Array<{ status: number; body: unknown }>,
): ReturnType<typeof vi.fn> {
  let call = 0;
  return vi.fn(async () => {
    const r = responses[call++] ?? responses[responses.length - 1];
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
    } as unknown as Response;
  });
}

/** Capture the JSON bodies of all fetch calls and return them as parsed objects. */
async function capturedBodies(
  fetchMock: ReturnType<typeof vi.fn>,
): Promise<unknown[]> {
  return fetchMock.mock.calls.map((args) => {
    const init = args[1] as RequestInit | undefined;
    if (!init?.body) return null;
    return JSON.parse(init.body as string);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  PropertyIntelligenceStore — unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertyIntelligenceStore", () => {
  const mGetConfig = vi.mocked(getAgentOsConfig);
  const mIsEnabled = vi.mocked(isAgentOsFeatureEnabled);
  const mEmbedText = vi.mocked(embedText);
  const mSparseVec = vi.mocked(buildHashedSparseVector);

  beforeEach(() => {
    vi.clearAllMocks();
    mGetConfig.mockReturnValue(makeConfig() as ReturnType<typeof getAgentOsConfig>);
    mIsEnabled.mockReturnValue(true);
    mEmbedText.mockResolvedValue(FAKE_DENSE_VECTOR);
    mSparseVec.mockReturnValue(FAKE_SPARSE_VECTOR);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ── H1: Feature flag ──────────────────────────────────────────────────────

  describe("H1 — Feature flag (AGENTOS_QDRANT_HYBRID_ENABLED)", () => {
    /**
     * DIAGNOSIS: This is most likely the root cause.
     * env var defaults to `false` in config.ts line 125:
     *   qdrantHybridRetrieval: readBoolean("AGENTOS_QDRANT_HYBRID_ENABLED", false)
     *
     * AND isAgentOsFeatureEnabled() requires BOTH:
     *   config.enabled (AGENTOS_ENABLED) AND config.features.qdrantHybridRetrieval
     *
     * In production, if neither env var is set, upsert() throws and search() returns [].
     */
    it("upsert throws 'disabled' when qdrantHybridRetrieval is off", async () => {
      mIsEnabled.mockReturnValue(false);
      const store = new PropertyIntelligenceStore(null as never, QDRANT_URL);
      await expect(
        store.upsert({
          parcelId: TEST_PARCEL_ID,
          address: TEST_ADDRESS,
          parish: TEST_PARISH,
          orgId: TEST_ORG_ID,
        }),
      ).rejects.toThrow("disabled");
    });

    it("search returns empty array (not an error) when qdrantHybridRetrieval is off", async () => {
      mIsEnabled.mockReturnValue(false);
      const store = new PropertyIntelligenceStore(null as never, QDRANT_URL);
      const results = await store.search("flood zones", TEST_ORG_ID);
      // ISSUE: silent empty — agent gets no feedback that memory is disabled
      expect(results).toEqual([]);
    });

    it("upsert succeeds when feature flag is enabled", async () => {
      mIsEnabled.mockReturnValue(true);
      const fetchMock = makeFetchSequence([
        { status: 200, body: { result: { status: "ok" } } }, // collection check
        { status: 200, body: { result: { status: "ok" } } }, // upsert
      ]);
      vi.stubGlobal("fetch", fetchMock);
      const store = new PropertyIntelligenceStore(null as never, QDRANT_URL);
      await store.createIfNotExists();
      await expect(
        store.upsert({
          parcelId: TEST_PARCEL_ID,
          address: TEST_ADDRESS,
          parish: TEST_PARISH,
          orgId: TEST_ORG_ID,
        }),
      ).resolves.toBeTypeOf("string"); // returns pointId UUID
    });
  });

  // ── H2: Collection initialization ────────────────────────────────────────

  describe("H2 — Collection initialization", () => {
    it("skips PUT when collection already exists (200 on GET)", async () => {
      const fetchMock = makeFetchSequence([
        { status: 200, body: { result: { name: COLLECTION } } }, // exists
      ]);
      vi.stubGlobal("fetch", fetchMock);
      const store = new PropertyIntelligenceStore(null as never, QDRANT_URL);
      await store.createIfNotExists();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("issues PUT to create collection when GET returns non-200", async () => {
      const fetchMock = makeFetchSequence([
        { status: 404, body: {} }, // collection missing
        { status: 200, body: { result: true } }, // create OK
      ]);
      vi.stubGlobal("fetch", fetchMock);
      const store = new PropertyIntelligenceStore(null as never, QDRANT_URL);
      await store.createIfNotExists();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [, createCall] = fetchMock.mock.calls;
      expect((createCall[1] as RequestInit).method).toBe("PUT");
    });

    it("collection PUT includes dense (1536-dim, Cosine) and sparse (bm25) vectors", async () => {
      const fetchMock = makeFetchSequence([
        { status: 404, body: {} },
        { status: 200, body: { result: true } },
      ]);
      vi.stubGlobal("fetch", fetchMock);
      const store = new PropertyIntelligenceStore(null as never, QDRANT_URL);
      await store.createIfNotExists();
      const bodies = await capturedBodies(fetchMock);
      const createBody = bodies[1] as {
        vectors: Record<string, { size: number; distance: string }>;
        sparse_vectors: Record<string, unknown>;
      };
      expect(createBody.vectors["dense"]).toEqual({ size: 1536, distance: "Cosine" });
      expect(createBody.sparse_vectors["bm25"]).toBeDefined();
    });

    it("search still fetches (may fail) when createIfNotExists was NOT called first", async () => {
      // PropertyMemoryTools calls createIfNotExists before search — but let's verify
      // the tool wrapper does this (important: if it doesn't, cold-start will always fail)
      const fetchMock = makeFetchSequence([
        { status: 200, body: { result: { name: COLLECTION } } }, // createIfNotExists check
        { status: 200, body: { result: { points: [] } } }, // search
      ]);
      vi.stubGlobal("fetch", fetchMock);
      // Simulate what the tool execute() function does
      const store = new PropertyIntelligenceStore(null as never, QDRANT_URL);
      await store.createIfNotExists();
      const results = await store.search("flood zones", TEST_ORG_ID);
      expect(results).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  // ── H3: Storage payload verification ─────────────────────────────────────

  describe("H3 — Storage payload (what actually goes into Qdrant)", () => {
    function upsertFixture() {
      const fetchMock = makeFetchSequence([
        { status: 200, body: { result: { status: "ok" } } },
      ]);
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    it("embeds a human-readable NL summary (not raw JSON)", async () => {
      const fetchMock = upsertFixture();
      const store = new PropertyIntelligenceStore(null as never, QDRANT_URL);
      await store.upsert({
        parcelId: TEST_PARCEL_ID,
        address: TEST_ADDRESS,
        parish: TEST_PARISH,
        zoning: "M1",
        acreage: 5.2,
        orgId: TEST_ORG_ID,
      });
      // embedText should have been called with a human-readable summary
      expect(mEmbedText).toHaveBeenCalledTimes(1);
      const embeddedText = mEmbedText.mock.calls[0][0] as string;
      expect(embeddedText).toContain(TEST_ADDRESS);
      expect(embeddedText).toContain(TEST_PARISH);
      expect(embeddedText).toContain("M1");
      expect(embeddedText).toContain("5.2");
      // Must NOT be JSON
      expect(embeddedText).not.toContain("{");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("payload contains org_id for tenant isolation", async () => {
      const fetchMock = upsertFixture();
      const store = new PropertyIntelligenceStore(null as never, QDRANT_URL);
      await store.upsert({
        parcelId: TEST_PARCEL_ID,
        address: TEST_ADDRESS,
        parish: TEST_PARISH,
        orgId: TEST_ORG_ID,
      });
      const bodies = await capturedBodies(fetchMock);
      const upsertBody = bodies[0] as {
        points: Array<{ payload: Record<string, unknown> }>;
      };
      expect(upsertBody.points[0].payload["org_id"]).toBe(TEST_ORG_ID);
    });

    it("payload contains parcel_id, address, parish, screening_summary", async () => {
      const fetchMock = upsertFixture();
      const store = new PropertyIntelligenceStore(null as never, QDRANT_URL);
      await store.upsert({
        parcelId: TEST_PARCEL_ID,
        address: TEST_ADDRESS,
        parish: TEST_PARISH,
        orgId: TEST_ORG_ID,
      });
      const bodies = await capturedBodies(fetchMock);
      const payload = (bodies[0] as {
        points: Array<{ payload: Record<string, unknown> }>;
      }).points[0].payload;
      expect(payload["parcel_id"]).toBe(TEST_PARCEL_ID);
      expect(payload["address"]).toBe(TEST_ADDRESS);
      expect(payload["parish"]).toBe(TEST_PARISH);
      expect(payload["screening_summary"]).toBeTypeOf("string");
    });

    it("includes named dense vector under 'dense' key (not root)", async () => {
      const fetchMock = upsertFixture();
      const store = new PropertyIntelligenceStore(null as never, QDRANT_URL);
      await store.upsert({
        parcelId: TEST_PARCEL_ID,
        address: TEST_ADDRESS,
        parish: TEST_PARISH,
        orgId: TEST_ORG_ID,
      });
      const bodies = await capturedBodies(fetchMock);
      const point = (bodies[0] as { points: Array<{ vector: Record<string, unknown> }> }).points[0];
      // Named vectors must be nested: { vector: { dense: [...], bm25: {...} } }
      expect(point.vector["dense"]).toBeDefined();
      expect(point.vector["dense"]).toBeInstanceOf(Array);
    });

    it("includes named sparse vector under 'bm25' key (not root)", async () => {
      const fetchMock = upsertFixture();
      const store = new PropertyIntelligenceStore(null as never, QDRANT_URL);
      await store.upsert({
        parcelId: TEST_PARCEL_ID,
        address: TEST_ADDRESS,
        parish: TEST_PARISH,
        orgId: TEST_ORG_ID,
      });
      const bodies = await capturedBodies(fetchMock);
      const point = (bodies[0] as { points: Array<{ vector: Record<string, unknown> }> }).points[0];
      expect(point.vector["bm25"]).toBeDefined();
      expect(point.vector["bm25"]).toEqual(FAKE_SPARSE_VECTOR);
    });

    it("extracts flood-zone environmental flags from screening result", async () => {
      const fetchMock = upsertFixture();
      const store = new PropertyIntelligenceStore(null as never, QDRANT_URL);
      await store.upsert({
        parcelId: TEST_PARCEL_ID,
        address: TEST_ADDRESS,
        parish: TEST_PARISH,
        orgId: TEST_ORG_ID,
        screeningResult: {
          flood: { zones: [{ zone_code: "AE", overlap_pct: 45 }] },
        },
      });
      const bodies = await capturedBodies(fetchMock);
      const payload = (bodies[0] as {
        points: Array<{ payload: Record<string, unknown> }>;
      }).points[0].payload;
      expect(payload["environmental_flags"]).toContain("flood:AE");
    });

    it("NL summary contains 'Flood zones: AE' when flood present", async () => {
      upsertFixture();
      const store = new PropertyIntelligenceStore(null as never, QDRANT_URL);
      await store.upsert({
        parcelId: TEST_PARCEL_ID,
        address: TEST_ADDRESS,
        parish: TEST_PARISH,
        orgId: TEST_ORG_ID,
        screeningResult: {
          flood: { zones: [{ zone_code: "AE", overlap_pct: 45 }] },
        },
      });
      const embeddedText = mEmbedText.mock.calls[0][0] as string;
      expect(embeddedText).toContain("AE");
      expect(embeddedText).toContain("45");
    });

    it("NL summary includes 'No flood zone.' when no flood data present", async () => {
      upsertFixture();
      const store = new PropertyIntelligenceStore(null as never, QDRANT_URL);
      await store.upsert({
        parcelId: TEST_PARCEL_ID,
        address: TEST_ADDRESS,
        parish: TEST_PARISH,
        orgId: TEST_ORG_ID,
        screeningResult: { flood: { zones: [] } },
      });
      const embeddedText = mEmbedText.mock.calls[0][0] as string;
      expect(embeddedText).toContain("No flood zone");
    });

    it("stores dealNotes in payload", async () => {
      const fetchMock = upsertFixture();
      const store = new PropertyIntelligenceStore(null as never, QDRANT_URL);
      await store.upsert({
        parcelId: TEST_PARCEL_ID,
        address: TEST_ADDRESS,
        parish: TEST_PARISH,
        orgId: TEST_ORG_ID,
        dealNotes: "Owner willing to ground lease only",
      });
      const bodies = await capturedBodies(fetchMock);
      const payload = (bodies[0] as {
        points: Array<{ payload: Record<string, unknown> }>;
      }).points[0].payload;
      expect(payload["deal_notes"]).toBe("Owner willing to ground lease only");
    });
  });

  // ── H4 & H5: Retrieval filter and response parsing ───────────────────────

  describe("H4 & H5 — Retrieval: org_id filter, minScore, and response parsing", () => {
    function makeSearchResponse(
      points: Array<{ score: number; payload: Record<string, unknown> }>,
    ) {
      return makeFetchSequence([
        {
          status: 200,
          // H5: Qdrant /points/query wraps in result.points (not result directly)
          body: { result: { points } },
        },
      ]);
    }

    it("query body includes org_id must-filter", async () => {
      const fetchMock = makeSearchResponse([]);
      vi.stubGlobal("fetch", fetchMock);
      const store = new PropertyIntelligenceStore(null as never, QDRANT_URL);
      await store.search("flood zones", TEST_ORG_ID);
      const bodies = await capturedBodies(fetchMock);
      const body = bodies[0] as {
        prefetch: Array<{ filter: { must: Array<{ key: string; match: { value: string } }> } }>;
      };
      const mustFilters = body.prefetch[0].filter.must;
      const orgFilter = mustFilters.find((f) => f.key === "org_id");
      // H4: Verify exact format expected by Qdrant
      expect(orgFilter).toEqual({ key: "org_id", match: { value: TEST_ORG_ID } });
    });

    it("query body includes parish must-filter when parish is provided", async () => {
      const fetchMock = makeSearchResponse([]);
      vi.stubGlobal("fetch", fetchMock);
      const store = new PropertyIntelligenceStore(null as never, QDRANT_URL);
      await store.search("flood zones", TEST_ORG_ID, "Ascension");
      const bodies = await capturedBodies(fetchMock);
      const body = bodies[0] as {
        prefetch: Array<{ filter: { must: Array<{ key: string; match: { value: string } }> } }>;
      };
      const mustFilters = body.prefetch[0].filter.must;
      const parishFilter = mustFilters.find((f) => f.key === "parish");
      expect(parishFilter).toEqual({ key: "parish", match: { value: "Ascension" } });
    });

    it("query body does NOT include parish filter when parish is undefined", async () => {
      const fetchMock = makeSearchResponse([]);
      vi.stubGlobal("fetch", fetchMock);
      const store = new PropertyIntelligenceStore(null as never, QDRANT_URL);
      await store.search("flood zones", TEST_ORG_ID, undefined);
      const bodies = await capturedBodies(fetchMock);
      const body = bodies[0] as {
        prefetch: Array<{ filter: { must: Array<{ key: string }> } }>;
      };
      const mustFilters = body.prefetch[0].filter.must;
      const parishFilter = mustFilters.find((f) => f.key === "parish");
      expect(parishFilter).toBeUndefined();
    });

    it("uses RRF fusion (not direct query)", async () => {
      const fetchMock = makeSearchResponse([]);
      vi.stubGlobal("fetch", fetchMock);
      const store = new PropertyIntelligenceStore(null as never, QDRANT_URL);
      await store.search("flood zones", TEST_ORG_ID);
      const bodies = await capturedBodies(fetchMock);
      const body = bodies[0] as { query: { fusion: string }; prefetch: unknown[] };
      expect(body.query).toEqual({ fusion: "rrf" });
      expect(body.prefetch).toHaveLength(2); // dense + sparse
    });

    it("dense prefetch uses 'dense' vector, sparse prefetch uses 'bm25' vector", async () => {
      const fetchMock = makeSearchResponse([]);
      vi.stubGlobal("fetch", fetchMock);
      const store = new PropertyIntelligenceStore(null as never, QDRANT_URL);
      await store.search("flood zones", TEST_ORG_ID);
      const bodies = await capturedBodies(fetchMock);
      const body = bodies[0] as {
        prefetch: Array<{ query: unknown; using: string }>;
      };
      expect(body.prefetch[0].using).toBe("dense");
      expect(body.prefetch[1].using).toBe("bm25");
    });

    it("correctly maps result.points to PropertyIntelligenceHit array", async () => {
      const fetchMock = makeSearchResponse([
        {
          score: 0.85,
          payload: {
            parcel_id: TEST_PARCEL_ID,
            address: TEST_ADDRESS,
            parish: TEST_PARISH,
            zoning: "M1",
            acreage: 5.2,
            screening_summary: "Industrial parcel near EPA site.",
          },
        },
      ]);
      vi.stubGlobal("fetch", fetchMock);
      const store = new PropertyIntelligenceStore(null as never, QDRANT_URL);
      const results = await store.search("industrial EPA", TEST_ORG_ID, undefined, 0.0, 5);
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        parcelId: TEST_PARCEL_ID,
        address: TEST_ADDRESS,
        parish: TEST_PARISH,
        zoning: "M1",
        acreage: 5.2,
        score: 0.85,
        summary: "Industrial parcel near EPA site.",
      });
    });

    it("H3 — filters out results below minScore", async () => {
      /**
       * DIAGNOSIS: RRF fusion scores are NOT cosine similarity (0–1).
       * They are based on rank positions and may be very small (e.g., 0.01).
       * The default minScore in store.search() is 0.0, but the tool passes
       * params.minScore ?? 0.3 — so valid results with score < 0.3 get dropped.
       */
      const fetchMock = makeSearchResponse([
        { score: 0.5, payload: { parcel_id: "p1", address: "A1", parish: "EBR", screening_summary: "ok" } },
        { score: 0.1, payload: { parcel_id: "p2", address: "A2", parish: "EBR", screening_summary: "ok" } },
        { score: 0.05, payload: { parcel_id: "p3", address: "A3", parish: "EBR", screening_summary: "ok" } },
      ]);
      vi.stubGlobal("fetch", fetchMock);
      const store = new PropertyIntelligenceStore(null as never, QDRANT_URL);
      // With minScore=0.3, only p1 should survive
      const results = await store.search("test", TEST_ORG_ID, undefined, 0.3, 10);
      expect(results).toHaveLength(1);
      expect(results[0].parcelId).toBe("p1");
    });

    it("returns empty array (not throws) when Qdrant returns non-OK", async () => {
      const fetchMock = makeFetchSequence([{ status: 500, body: { error: "Internal error" } }]);
      vi.stubGlobal("fetch", fetchMock);
      const store = new PropertyIntelligenceStore(null as never, QDRANT_URL);
      const results = await store.search("test", TEST_ORG_ID);
      expect(results).toEqual([]);
    });

    it("H5 — returns empty array if Qdrant wraps results at wrong path", async () => {
      /**
       * DIAGNOSIS: Older Qdrant versions return { result: [...] } (array directly).
       * The code expects { result: { points: [...] } } (/points/query format, Qdrant v1.8+).
       * If Qdrant returns the older format, result?.points is undefined → empty results.
       */
      const fetchMock = makeFetchSequence([
        {
          status: 200,
          // Simulating older Qdrant response format (wrong)
          body: {
            result: [
              {
                score: 0.9,
                payload: { parcel_id: "p1", address: "A1", parish: "EBR", screening_summary: "x" },
              },
            ],
          },
        },
      ]);
      vi.stubGlobal("fetch", fetchMock);
      const store = new PropertyIntelligenceStore(null as never, QDRANT_URL);
      const results = await store.search("test", TEST_ORG_ID, undefined, 0.0, 10);
      // If this returns [], Qdrant version mismatch is silently swallowing results
      expect(results).toEqual([]);
      // EXPECTATION: This test documents a silent failure mode.
      // Fix: verify Qdrant version >= 1.8 supports /points/query, OR use /points/search.
    });

    it("limits results to topK even if Qdrant returns more", async () => {
      const fetchMock = makeSearchResponse(
        Array.from({ length: 20 }, (_, i) => ({
          score: 0.9 - i * 0.01,
          payload: { parcel_id: `p${i}`, address: `A${i}`, parish: "EBR", screening_summary: "x" },
        })),
      );
      vi.stubGlobal("fetch", fetchMock);
      const store = new PropertyIntelligenceStore(null as never, QDRANT_URL);
      const results = await store.search("test", TEST_ORG_ID, undefined, 0.0, 5);
      expect(results.length).toBeLessThanOrEqual(5);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Agent-facing tool wrappers
// ─────────────────────────────────────────────────────────────────────────────

describe("store_property_finding tool (agent-facing wrapper)", () => {
  const mIsEnabled = vi.mocked(isAgentOsFeatureEnabled);
  const mGetConfig = vi.mocked(getAgentOsConfig);
  const mEmbedText = vi.mocked(embedText);
  const mSparseVec = vi.mocked(buildHashedSparseVector);

  beforeEach(() => {
    vi.clearAllMocks();
    mGetConfig.mockReturnValue(makeConfig() as ReturnType<typeof getAgentOsConfig>);
    mIsEnabled.mockReturnValue(true);
    mEmbedText.mockResolvedValue(FAKE_DENSE_VECTOR);
    mSparseVec.mockReturnValue(FAKE_SPARSE_VECTOR);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns { stored: false, error } when feature flag is off — not a thrown exception", async () => {
    /**
     * DIAGNOSIS: When AGENTOS_QDRANT_HYBRID_ENABLED=false (default), the store tool
     * returns { stored: false, error: "Qdrant hybrid retrieval is disabled" }.
     * The agent sees this as a successful tool call with a failed result — it may
     * silently proceed without the data being persisted.
     */
    mIsEnabled.mockReturnValue(false);
    vi.stubGlobal(
      "fetch",
      makeFetchSequence([
        { status: 200, body: { result: { name: "property_intelligence" } } }, // createIfNotExists
      ]),
    );
    // @ts-expect-error — tool.execute() signature accepts raw params
    const result = await store_property_finding.execute({
      orgId: TEST_ORG_ID,
      parcelId: TEST_PARCEL_ID,
      address: TEST_ADDRESS,
      parish: TEST_PARISH,
    });
    expect(result.stored).toBe(false);
    expect(result.error).toContain("disabled");
  });

  it("returns { stored: true } with valid params when feature is on", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetchSequence([
        { status: 200, body: { result: { name: COLLECTION } } }, // createIfNotExists
        { status: 200, body: { result: { status: "ok" } } }, // upsert
      ]),
    );
    // @ts-expect-error — tool.execute() signature accepts raw params
    const result = await store_property_finding.execute({
      orgId: TEST_ORG_ID,
      parcelId: TEST_PARCEL_ID,
      address: TEST_ADDRESS,
      parish: TEST_PARISH,
      zoning: "M1",
      acreage: 5.0,
      dealNotes: "Seller motivated",
    });
    expect(result.stored).toBe(true);
    expect(result.parcelId).toBe(TEST_PARCEL_ID);
  });

  it("returns { stored: false } gracefully on Qdrant network failure", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetchSequence([
        { status: 200, body: { result: { name: COLLECTION } } }, // createIfNotExists
        { status: 503, body: { error: "Service unavailable" } }, // upsert fails
      ]),
    );
    // @ts-expect-error -- tool.execute accepts raw params in tests
    const result = await store_property_finding.execute({
      orgId: TEST_ORG_ID,
      parcelId: TEST_PARCEL_ID,
      address: TEST_ADDRESS,
      parish: TEST_PARISH,
    });
    // Tool should not throw — it should return graceful error
    expect(result.stored).toBe(false);
  });
});

describe("recall_property_intelligence tool (agent-facing wrapper)", () => {
  const mIsEnabled = vi.mocked(isAgentOsFeatureEnabled);
  const mGetConfig = vi.mocked(getAgentOsConfig);
  const mEmbedText = vi.mocked(embedText);
  const mSparseVec = vi.mocked(buildHashedSparseVector);

  beforeEach(() => {
    vi.clearAllMocks();
    mGetConfig.mockReturnValue(makeConfig() as ReturnType<typeof getAgentOsConfig>);
    mIsEnabled.mockReturnValue(true);
    mEmbedText.mockResolvedValue(FAKE_DENSE_VECTOR);
    mSparseVec.mockReturnValue(FAKE_SPARSE_VECTOR);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns memory_disabled indicator when feature flag is off (FIXED)", async () => {
    /**
     * FIXED: Was H1 diagnosis — agents got { results: [], count: 0 } with no
     * indication that memory is disabled. Now returns memory_disabled: true
     * so agents can surface a clear message instead of "no stored data".
     */
    mIsEnabled.mockReturnValue(false);
    // @ts-expect-error -- tool.execute accepts raw params in tests
    const result = await recall_property_intelligence.execute({
      orgId: TEST_ORG_ID,
      query: "flood zones near industrial parcels",
    });
    expect(result.results).toEqual([]);
    expect(result.count).toBe(0);
    expect(result.memory_disabled).toBe(true);
    expect(result.note).toContain("AGENTOS_ENABLED");
  });

  it("default minScore of 0.0 returns valid low-score RRF results (regression guard)", async () => {
    /**
     * FIXED: RRF scores are rank-based, not cosine similarity scores.
     * Valid relevant results have scores like 0.05–0.15. The old default
     * minScore=0.3 silently dropped all results. Fixed to default 0.0.
     */
    vi.stubGlobal(
      "fetch",
      makeFetchSequence([
        { status: 200, body: { result: { name: COLLECTION } } }, // createIfNotExists
        {
          status: 200,
          body: {
            result: {
              points: [
                {
                  score: 0.15, // Typical RRF score — must NOT be filtered by default
                  payload: { parcel_id: "p1", address: "A1", parish: "EBR", screening_summary: "relevant match" },
                },
              ],
            },
          },
        },
      ]),
    );
    // @ts-expect-error -- tool.execute accepts raw params in tests
    const result = await recall_property_intelligence.execute({
      orgId: TEST_ORG_ID,
      query: "flood zones",
      // no minScore override — tool uses 0.0 default, so score=0.15 is returned
    });
    // Result is now returned (was silently dropped before fix)
    expect(result.count).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].parcelId).toBe("p1");
  });

  it("returns results when Qdrant returns valid scored hits", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetchSequence([
        { status: 200, body: { result: { name: COLLECTION } } },
        {
          status: 200,
          body: {
            result: {
              points: [
                {
                  score: 0.45,
                  payload: {
                    parcel_id: TEST_PARCEL_ID,
                    address: TEST_ADDRESS,
                    parish: TEST_PARISH,
                    screening_summary: "Flood zone AE, 5.2 acres.",
                  },
                },
              ],
            },
          },
        },
      ]),
    );
    // @ts-expect-error -- tool.execute accepts raw params in tests
    const result = await recall_property_intelligence.execute({
      orgId: TEST_ORG_ID,
      query: "flood zone parcels",
    });
    expect(result.count).toBe(1);
    expect(result.results[0].parcelId).toBe(TEST_PARCEL_ID);
  });

  it("caps topK at 20 regardless of input", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetchSequence([
        { status: 200, body: { result: { name: COLLECTION } } },
        { status: 200, body: { result: { points: [] } } },
      ]),
    );
    // @ts-expect-error -- tool.execute accepts raw params in tests
    await recall_property_intelligence.execute({
      orgId: TEST_ORG_ID,
      query: "all parcels",
      topK: 999, // should be clamped to 20
    });
    // Verify the store.search was called with topK=20
    // (indirectly: the query limit in fetch body should be ≤ 40 which is topK*2 capped at max(20*2,10)=40)
    const fetchCalls = vi.mocked(global.fetch).mock.calls;
    const searchCall = fetchCalls[fetchCalls.length - 1];
    const searchBody = JSON.parse((searchCall[1] as RequestInit).body as string) as {
      limit: number;
    };
    expect(searchBody.limit).toBeLessThanOrEqual(40); // overFetch = max(topK*2, 10) with topK=20
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Summary: Expected failure modes and root causes
// ─────────────────────────────────────────────────────────────────────────────
//
//  The tests above document the following failure modes:
//
//  1. FEATURE FLAG OFF (most likely root cause)
//     - AGENTOS_ENABLED and AGENTOS_QDRANT_HYBRID_ENABLED both default to false
//     - upsert() silently fails with stored=false, search() returns []
//     - Fix: Set AGENTOS_ENABLED=true, AGENTOS_QDRANT_HYBRID_ENABLED=true in Vercel env
//
//  2. RRF SCORE VS MINSCORE THRESHOLD
//     - Default minScore=0.3 may drop all RRF results (scores are rank-based, often <0.2)
//     - Fix: Lower default minScore in tool definition to 0.0 or 0.05
//
//  3. QDRANT VERSION MISMATCH (potential)
//     - /points/query (Qdrant v1.8+) returns { result: { points: [...] } }
//     - /points/search (older) returns { result: [...] }
//     - If running an older Qdrant image, all searches return []
//     - Fix: Check docker image version; ensure qdrant/qdrant:latest >= v1.8.0
//
//  4. SILENT FAILURES
//     - All failures return graceful results (no exceptions reach the agent)
//     - Agent cannot distinguish "no results found" from "memory system offline"
//     - Fix: Add structured error indicator in tool responses when system is disabled
