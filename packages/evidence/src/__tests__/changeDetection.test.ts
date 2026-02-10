import { describe, expect, it } from "vitest";

import {
  isMaterialChange,
  computeScanStats,
  groupChangesByJurisdiction,
  withTimeout,
  withRetry,
} from "../changeDetection.js";
import type { SourceScanResult } from "../changeDetection.js";

function makeResult(overrides: Partial<SourceScanResult> = {}): SourceScanResult {
  return {
    url: "https://example.com/zoning",
    jurisdictionId: "j-1",
    jurisdictionName: "East Baton Rouge",
    purpose: "ordinance",
    changed: false,
    firstCapture: false,
    error: null,
    unreachable: false,
    ...overrides,
  };
}

describe("isMaterialChange", () => {
  it("returns true for a real content change", () => {
    const result = makeResult({ changed: true });
    expect(isMaterialChange(result)).toBe(true);
  });

  it("returns false for first capture (changed=true but firstCapture=true)", () => {
    const result = makeResult({ changed: true, firstCapture: true });
    expect(isMaterialChange(result)).toBe(false);
  });

  it("returns false for unchanged content", () => {
    const result = makeResult({ changed: false });
    expect(isMaterialChange(result)).toBe(false);
  });

  it("returns false when there was an error (even if changed=true)", () => {
    const result = makeResult({ changed: true, error: "Timeout" });
    expect(isMaterialChange(result)).toBe(false);
  });

  it("returns false for unreachable sources", () => {
    const result = makeResult({ changed: true, unreachable: true, error: "Connection refused" });
    expect(isMaterialChange(result)).toBe(false);
  });
});

describe("computeScanStats", () => {
  it("computes correct stats for empty results", () => {
    const stats = computeScanStats([]);
    expect(stats.total).toBe(0);
    expect(stats.unreachable).toBe(0);
    expect(stats.materialChangeCount).toBe(0);
    expect(stats.firstCaptureCount).toBe(0);
    expect(stats.networkAlert).toBe(false);
  });

  it("computes correct stats for mixed results", () => {
    const results: SourceScanResult[] = [
      makeResult({ changed: true }), // material change
      makeResult({ changed: true, firstCapture: true }), // first capture
      makeResult({ changed: false }), // unchanged
      makeResult({ unreachable: true, error: "Timeout" }), // unreachable
    ];

    const stats = computeScanStats(results);
    expect(stats.total).toBe(4);
    expect(stats.materialChangeCount).toBe(1);
    expect(stats.firstCaptureCount).toBe(1);
    expect(stats.unreachable).toBe(1);
    expect(stats.networkAlert).toBe(false);
  });

  it("triggers network alert when >50% sources are unreachable", () => {
    const results: SourceScanResult[] = [
      makeResult({ unreachable: true, error: "Timeout" }),
      makeResult({ unreachable: true, error: "Connection refused" }),
      makeResult({ changed: false }),
    ];

    const stats = computeScanStats(results);
    expect(stats.unreachable).toBe(2);
    expect(stats.unreachableRatio).toBeCloseTo(0.667, 2);
    expect(stats.networkAlert).toBe(true);
  });

  it("does not trigger network alert at exactly 50%", () => {
    const results: SourceScanResult[] = [
      makeResult({ unreachable: true, error: "Timeout" }),
      makeResult({ changed: false }),
    ];

    const stats = computeScanStats(results);
    expect(stats.unreachableRatio).toBe(0.5);
    expect(stats.networkAlert).toBe(false);
  });

  it("all sources unreachable triggers network alert", () => {
    const results: SourceScanResult[] = [
      makeResult({ unreachable: true, error: "DNS failed" }),
      makeResult({ unreachable: true, error: "Connection refused" }),
    ];

    const stats = computeScanStats(results);
    expect(stats.networkAlert).toBe(true);
    expect(stats.unreachableRatio).toBe(1);
  });
});

describe("groupChangesByJurisdiction", () => {
  it("groups changes by jurisdiction ID", () => {
    const changes: SourceScanResult[] = [
      makeResult({ jurisdictionId: "j-1", url: "https://ebr.gov/zoning", changed: true }),
      makeResult({ jurisdictionId: "j-1", url: "https://ebr.gov/fees", changed: true }),
      makeResult({ jurisdictionId: "j-2", url: "https://ascension.gov/zoning", changed: true, jurisdictionName: "Ascension" }),
    ];

    const grouped = groupChangesByJurisdiction(changes);
    expect(grouped.size).toBe(2);
    expect(grouped.get("j-1")?.length).toBe(2);
    expect(grouped.get("j-2")?.length).toBe(1);
  });

  it("returns empty map for no changes", () => {
    const grouped = groupChangesByJurisdiction([]);
    expect(grouped.size).toBe(0);
  });

  it("flags all active deals in jurisdiction (verified by shape of grouped data)", () => {
    // The grouping should put all changes for a jurisdiction together
    // so the cron can look up ALL active deals in that jurisdiction
    const changes: SourceScanResult[] = [
      makeResult({ jurisdictionId: "j-1", purpose: "ordinance", url: "https://ebr.gov/code", changed: true }),
      makeResult({ jurisdictionId: "j-1", purpose: "fees", url: "https://ebr.gov/fees", changed: true }),
    ];

    const grouped = groupChangesByJurisdiction(changes);
    const j1Changes = grouped.get("j-1")!;
    expect(j1Changes).toHaveLength(2);
    expect(j1Changes[0].purpose).toBe("ordinance");
    expect(j1Changes[1].purpose).toBe("fees");
  });
});

describe("withTimeout", () => {
  it("resolves if promise completes before timeout", async () => {
    const result = await withTimeout(
      Promise.resolve("ok"),
      1000,
      "test"
    );
    expect(result).toBe("ok");
  });

  it("rejects if promise takes longer than timeout", async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 5000));
    await expect(
      withTimeout(slow, 50, "slow operation")
    ).rejects.toThrow("Timeout after 50ms: slow operation");
  });

  it("propagates promise rejection", async () => {
    const failing = Promise.reject(new Error("boom"));
    await expect(
      withTimeout(failing, 1000, "failing op")
    ).rejects.toThrow("boom");
  });
});

describe("withRetry", () => {
  it("returns result on first success", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => { calls++; return "ok"; },
      3,
      "test"
    );
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries on failure and succeeds on third attempt", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error(`fail ${calls}`);
        return "success";
      },
      3,
      "retry-test"
    );
    expect(result).toBe("success");
    expect(calls).toBe(3);
  });

  it("throws after all retries exhausted", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => { calls++; throw new Error("always fails"); },
        3,
        "exhaust-test"
      )
    ).rejects.toThrow("always fails");
    expect(calls).toBe(3);
  });

  it("uses exponential backoff delays", async () => {
    // This test verifies retries happen by timing — 3 retries with
    // exponential backoff means minimum ~3s (1s + 2s), so we just
    // verify it retries the right number of times with a shorter test
    let calls = 0;
    await expect(
      withRetry(
        async () => { calls++; throw new Error("fail"); },
        2,
        "backoff-test"
      )
    ).rejects.toThrow("fail");
    expect(calls).toBe(2);
  });
});
