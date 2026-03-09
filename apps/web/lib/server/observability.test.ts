import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createRequestObservabilityContext,
  logRequestOutcome,
  logRequestStart,
  queryRecentObservability,
  recordMonitorSnapshot,
} from "./observability";
import { resetObservabilityStore } from "./observabilityStore";

const originalInfo = console.info;
const originalWarn = console.warn;
const originalError = console.error;
const originalDebug = console.debug;

describe("observability helpers", () => {
  beforeEach(() => {
    resetObservabilityStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-06T20:00:00.000Z"));
    console.info = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
    console.debug = vi.fn();
  });

  afterEach(() => {
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
    console.debug = originalDebug;
    vi.useRealTimers();
  });

  it("logs request lifecycle events into the store", async () => {
    const context = createRequestObservabilityContext(
      {
        method: "get",
        headers: new Headers(),
      },
      "/api/parcels",
    );

    await logRequestStart(context, {
      orgId: "org-1",
      userId: "user-1",
    });

    vi.setSystemTime(new Date("2026-03-06T20:00:02.000Z"));
    await logRequestOutcome(context, {
      status: 502,
      orgId: "org-1",
      userId: "user-1",
      upstream: "gateway",
      error: new Error("gateway timeout"),
      details: {
        resultCount: 0,
      },
    });

    const result = await queryRecentObservability({ route: "/api/parcels" });

    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({
      event: "request_complete",
      level: "error",
      route: "/api/parcels",
      orgId: "org-1",
      userId: "user-1",
      upstream: "gateway",
      status: 502,
      durationMs: 2_000,
    });
    expect(result.events[0].fields.error).toMatchObject({
      name: "Error",
      message: "gateway timeout",
    });
    expect(result.events[0].fields.error).not.toHaveProperty("stack");
    expect(result.events[1]).toMatchObject({
      event: "request_start",
      level: "info",
      route: "/api/parcels",
    });
    expect(result.events[0].requestId).toBe(result.events[1].requestId);
  });

  it("records monitor snapshots through the helper wrapper", async () => {
    await recordMonitorSnapshot({
      source: "obs-monitor",
      surface: "/api/deals",
      status: "degraded",
      summary: "Deals endpoint latency above threshold",
      route: "/api/deals",
      details: {
        latencyMs: 3_200,
      },
    });

    const result = await queryRecentObservability({ kind: "monitor", surface: "/api/deals" });

    expect(result.monitorSnapshots).toHaveLength(1);
    expect(result.monitorSnapshots[0]).toMatchObject({
      source: "obs-monitor",
      surface: "/api/deals",
      status: "degraded",
      summary: "Deals endpoint latency above threshold",
      route: "/api/deals",
      details: {
        latencyMs: 3_200,
      },
    });
  });
});
