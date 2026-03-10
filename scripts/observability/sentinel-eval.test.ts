import { describe, expect, it } from "vitest";
import { evaluate, type SentinelInput, type WorkflowStats, type ProbeResult } from "./sentinel-eval.js";
import { loadThresholds, type SentinelThresholds } from "./sentinel-config.js";

function makeProbe(
  endpoint: string,
  statuses: number[],
  latencies?: number[],
  authenticated = false,
): ProbeResult {
  return {
    endpoint,
    method: "GET",
    authenticated,
    runs: statuses.map((status, i) => ({
      status,
      ttfbMs: latencies?.[i] ?? 200,
      totalMs: latencies?.[i] ?? 200,
    })),
  };
}

function makeWorkflow(overrides: Partial<WorkflowStats> = {}): WorkflowStats {
  return {
    totalEvents: 100,
    failedEvents: 2,
    transientFailures: 1,
    permanentFailures: 1,
    duplicateKeyViolations: 0,
    ...overrides,
  };
}

function makeInput(overrides: Partial<SentinelInput> = {}): SentinelInput {
  return {
    probes: [
      makeProbe("/api/agent/tools/execute", [401, 401, 401]),
      makeProbe("/api/parcels", [401, 401, 401]),
      makeProbe("/api/parcels/suggest", [401, 401, 401]),
      makeProbe("/api/parcels/{id}/geometry", [401, 401, 401]),
    ],
    workflow: makeWorkflow(),
    productionMode: false,
    collectedAt: new Date().toISOString(),
    ...overrides,
  };
}

function defaults(): SentinelThresholds {
  return loadThresholds();
}

// ─── Core pass/fail ────────────────────────────────────────────────────

describe("sentinel evaluate — core", () => {
  it("produces PASS verdict when all checks are healthy", () => {
    const result = evaluate(makeInput(), defaults());
    expect(result.verdict).toBe("PASS");
    expect(result.failCount).toBe(0);
    expect(result.checks.length).toBeGreaterThan(0);
    expect(result.version).toBe(1);
  });

  it("produces FAIL verdict when chat returns 405", () => {
    const input = makeInput({
      probes: [
        makeProbe("/api/agent/tools/execute", [401, 405, 401]),
        makeProbe("/api/parcels", [401]),
        makeProbe("/api/parcels/suggest", [401]),
        makeProbe("/api/parcels/{id}/geometry", [401]),
      ],
    });
    const result = evaluate(input, defaults());
    expect(result.verdict).toBe("FAIL");
    const check = result.checks.find((c) => c.name === "chat_405_count");
    expect(check!.status).toBe("fail");
    expect(check!.value).toBe(1);
  });

  it("produces FAIL when chat 5xx rate exceeds threshold", () => {
    const input = makeInput({
      probes: [
        makeProbe("/api/agent/tools/execute", [500, 500, 401, 401, 401]),
        makeProbe("/api/parcels", [401]),
        makeProbe("/api/parcels/suggest", [401]),
        makeProbe("/api/parcels/{id}/geometry", [401]),
      ],
    });
    const result = evaluate(input, { ...defaults(), chat5xxRateMax: 0.05 });
    expect(result.verdict).toBe("FAIL");
    expect(result.checks.find((c) => c.name === "chat_5xx_rate")!.status).toBe("fail");
  });

  it("includes timestamps", () => {
    const result = evaluate(makeInput(), defaults());
    expect(result.collectedAt).toBeTruthy();
    expect(result.evaluatedAt).toBeTruthy();
  });
});

// ─── Auth-gated latency (blocking task #2) ──────────────────────────

describe("sentinel evaluate — latency SLO semantics", () => {
  it("excludes 401 responses from latency p95 calculation", () => {
    const input = makeInput({
      probes: [
        makeProbe("/api/agent/tools/execute", [401]),
        makeProbe("/api/parcels", [401, 401, 401], [500, 600, 12000], false),
        makeProbe("/api/parcels/suggest", [401]),
        makeProbe("/api/parcels/{id}/geometry", [401]),
      ],
    });
    const result = evaluate(input, defaults());
    const check = result.checks.find((c) => c.name === "map_parcels_p95")!;
    // 401s are excluded → 0 latency-eligible samples → p95 = 0
    expect(check.value).toBe(0);
    expect(check.detail).toContain("auth-rejected probes excluded");
    expect(check.status).toBe("pass"); // unauth probe with 0 samples = pass (not warn)
  });

  it("uses 2xx latency from authenticated probes for SLO", () => {
    const input = makeInput({
      probes: [
        makeProbe("/api/agent/tools/execute", [401]),
        makeProbe("/api/parcels", [200, 200, 200], [500, 600, 9000], true),
        makeProbe("/api/parcels/suggest", [401]),
        makeProbe("/api/parcels/{id}/geometry", [401]),
      ],
    });
    const result = evaluate(input, { ...defaults(), mapParcelsP95MaxMs: 8000 });
    const check = result.checks.find((c) => c.name === "map_parcels_p95")!;
    expect(check.value).toBe(9000);
    expect(check.status).toBe("fail");
    expect(check.detail).toContain("samples: 3");
  });

  it("warns when authenticated probe returns 0 latency-eligible samples", () => {
    const input = makeInput({
      probes: [
        makeProbe("/api/agent/tools/execute", [401]),
        makeProbe("/api/parcels", [401, 401], [500, 600], true),
        makeProbe("/api/parcels/suggest", [401]),
        makeProbe("/api/parcels/{id}/geometry", [401]),
      ],
    });
    const result = evaluate(input, defaults());
    const check = result.checks.find((c) => c.name === "map_parcels_p95")!;
    // Authenticated but got 401 = token may be bad → warn
    expect(check.status).toBe("warn");
  });

  it("produces WARN when latency is between 80-100% of threshold", () => {
    const input = makeInput({
      probes: [
        makeProbe("/api/agent/tools/execute", [401]),
        makeProbe("/api/parcels", [200, 200, 200], [500, 600, 7000], true),
        makeProbe("/api/parcels/suggest", [401]),
        makeProbe("/api/parcels/{id}/geometry", [401]),
      ],
    });
    const result = evaluate(input, { ...defaults(), mapParcelsP95MaxMs: 8000 });
    const check = result.checks.find((c) => c.name === "map_parcels_p95")!;
    expect(check.status).toBe("warn");
  });
});

// ─── Map error rates ────────────────────────────────────────────────

describe("sentinel evaluate — map error rates", () => {
  it("produces FAIL when geometry 429 rate exceeds threshold", () => {
    const input = makeInput({
      probes: [
        makeProbe("/api/agent/tools/execute", [401]),
        makeProbe("/api/parcels", [401]),
        makeProbe("/api/parcels/suggest", [401]),
        makeProbe("/api/parcels/{id}/geometry", [429, 429, 200, 200, 200]),
      ],
    });
    const result = evaluate(input, { ...defaults(), mapGeometry429RateMax: 0.15 });
    const check = result.checks.find((c) => c.name === "map_geometry_429_rate")!;
    expect(check.status).toBe("fail");
    expect(check.value).toBe(0.4);
  });
});

// ─── Workflow (blocking task #3) ────────────────────────────────────

describe("sentinel evaluate — workflow visibility", () => {
  it("emits WARN when workflow DB unavailable in production mode", () => {
    const input = makeInput({ workflow: null, productionMode: true });
    const result = evaluate(input, defaults());
    const check = result.checks.find((c) => c.name === "workflow_db_available")!;
    expect(check).toBeDefined();
    expect(check.status).toBe("warn");
    expect(check.detail).toContain("unreachable in production");
  });

  it("emits PASS (not warn) when workflow DB unavailable in non-production", () => {
    const input = makeInput({ workflow: null, productionMode: false });
    const result = evaluate(input, defaults());
    const check = result.checks.find((c) => c.name === "workflow_db_available")!;
    expect(check.status).toBe("pass");
    expect(check.detail).toContain("non-production");
  });

  it("includes remediation hint for workflow_db_available warn", () => {
    const input = makeInput({ workflow: null, productionMode: true });
    const result = evaluate(input, defaults());
    expect(result.summary).toContain("Remediation");
    expect(result.summary).toContain("DATABASE_URL");
  });

  it("emits workflow_activity pass when workflow connected but idle", () => {
    const input = makeInput({ workflow: makeWorkflow({ totalEvents: 0 }) });
    const result = evaluate(input, defaults());
    const check = result.checks.find((c) => c.name === "workflow_activity")!;
    expect(check.status).toBe("pass");
    expect(check.detail).toContain("idle");
  });

  it("FAIL when workflow duplicate count > 0", () => {
    const input = makeInput({ workflow: makeWorkflow({ duplicateKeyViolations: 2 }) });
    const result = evaluate(input, defaults());
    expect(result.checks.find((c) => c.name === "workflow_duplicate_count")!.status).toBe("fail");
  });

  it("FAIL when workflow transient rate exceeds threshold", () => {
    const input = makeInput({
      workflow: makeWorkflow({ totalEvents: 10, transientFailures: 5, failedEvents: 5 }),
    });
    const result = evaluate(input, { ...defaults(), workflowTransientRateMax: 0.3 });
    expect(result.checks.find((c) => c.name === "workflow_transient_rate")!.status).toBe("fail");
  });

  it("PASS when all workflow stats healthy", () => {
    const input = makeInput({
      workflow: makeWorkflow({ totalEvents: 100, failedEvents: 1, transientFailures: 1, duplicateKeyViolations: 0 }),
    });
    const result = evaluate(input, defaults());
    expect(result.checks.filter((c) => c.surface === "workflow").every((c) => c.status === "pass")).toBe(true);
  });
});

// ─── Summary generation ──────────────────────────────────────────────

describe("sentinel evaluate — summary", () => {
  it("generates markdown with remediation hints on failure", () => {
    const input = makeInput({
      probes: [
        makeProbe("/api/agent/tools/execute", [405, 401, 401]),
        makeProbe("/api/parcels", [401]),
        makeProbe("/api/parcels/suggest", [401]),
        makeProbe("/api/parcels/{id}/geometry", [401]),
      ],
    });
    const result = evaluate(input, defaults());
    expect(result.summary).toContain("ALERT");
    expect(result.summary).toContain("Remediation");
    expect(result.summary).toContain("chat_405_count");
    expect(result.summary).toContain("shell-workflow");
  });

  it("generates clean summary on pass", () => {
    const result = evaluate(makeInput(), defaults());
    expect(result.summary).toContain("OK");
    expect(result.summary).not.toContain("ALERT");
  });

  it("includes remediation section for warnings too", () => {
    const input = makeInput({ workflow: null, productionMode: true });
    const result = evaluate(input, defaults());
    // verdict is PASS (warn doesn't cause FAIL) but summary includes remediation
    expect(result.verdict).toBe("PASS");
    expect(result.summary).toContain("Remediation");
  });
});

// ─── Config ──────────────────────────────────────────────────────────

describe("sentinel thresholds", () => {
  it("loads defaults without env overrides", () => {
    const t = loadThresholds();
    expect(t.chat405MaxCount).toBe(0);
    expect(t.chat5xxRateMax).toBe(0.05);
    expect(t.mapParcelsP95MaxMs).toBe(8000);
    expect(t.probeRuns).toBe(3);
    expect(t.probeTimeoutMs).toBe(15000);
  });
});

// ─── Cron route config integrity ─────────────────────────────────────

describe("sentinel cron config", () => {
  it("vercel.json contains sentinel cron entry with */10 schedule", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const vercelJson = JSON.parse(
      await fs.readFile(path.resolve(process.cwd(), "apps/web/vercel.json"), "utf-8"),
    );
    const sentinel = vercelJson.crons.find(
      (c: { path: string }) => c.path === "/api/cron/stability-sentinel",
    );
    expect(sentinel).toBeDefined();
    expect(sentinel.schedule).toBe("*/10 * * * *");
  });
});
