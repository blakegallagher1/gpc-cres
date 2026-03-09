import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  queryObservabilityStore,
  recordObservabilityEvent,
  recordObservabilityMonitorSnapshot,
  resetObservabilityStore,
} from "./observabilityStore";

describe("observabilityStore", () => {
  beforeEach(() => {
    resetObservabilityStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-06T18:00:00.000Z"));
  });

  it("records recent events newest-first and sanitizes fields", () => {
    recordObservabilityEvent({
      level: "info",
      event: "request_start",
      route: "/api/parcels",
      requestId: "req-1",
      fields: {
        nested: {
          ok: true,
        },
        error: new Error("boom"),
      },
    });

    vi.setSystemTime(new Date("2026-03-06T18:00:05.000Z"));
    recordObservabilityEvent({
      level: "warn",
      event: "request_complete",
      route: "/api/parcels",
      requestId: "req-1",
      status: 504,
      durationMs: 5_000,
      fields: {
        resultCount: 0,
      },
    });

    const result = queryObservabilityStore({ route: "/api/parcels" });

    expect(result.stats.totalEvents).toBe(2);
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({
      event: "request_complete",
      level: "warn",
      requestId: "req-1",
      status: 504,
      durationMs: 5_000,
    });
    expect(result.events[1].fields.error).toMatchObject({
      name: "Error",
      message: "boom",
    });
    expect(result.events[1].fields.error).not.toHaveProperty("stack");
  });

  it("caps retained events and filters monitor snapshots", () => {
    for (let index = 0; index < 205; index += 1) {
      vi.setSystemTime(new Date(1_700_000_000_000 + index * 1_000));
      recordObservabilityEvent({
        level: index % 2 === 0 ? "info" : "error",
        event: `event-${index}`,
        route: index % 2 === 0 ? "/api/health" : "/api/map/comps",
      });
    }

    vi.setSystemTime(new Date("2026-03-06T19:00:00.000Z"));
    recordObservabilityMonitorSnapshot({
      source: "production-monitor",
      surface: "/map",
      status: "error",
      summary: "Map request timed out",
      details: {
        check: "page-load",
      },
    });
    recordObservabilityMonitorSnapshot({
      source: "production-monitor",
      surface: "/api/health",
      status: "ok",
      summary: "Health route healthy",
    });

    const events = queryObservabilityStore({ kind: "event", limit: 250 });
    const snapshots = queryObservabilityStore({ kind: "monitor", source: "production-monitor", status: "error" });

    expect(events.stats.totalEvents).toBe(200);
    expect(events.events).toHaveLength(200);
    expect(events.events[0].event).toBe("event-204");
    expect(events.events.at(-1)?.event).toBe("event-5");

    expect(snapshots.monitorSnapshots).toHaveLength(1);
    expect(snapshots.monitorSnapshots[0]).toMatchObject({
      surface: "/map",
      status: "error",
      summary: "Map request timed out",
    });
  });

  it("sanitizes monitor snapshot details without preserving identity fields or stacks", () => {
    recordObservabilityMonitorSnapshot({
      source: "production-monitor",
      surface: "/map",
      status: "error",
      summary: "Map request failed",
      details: {
        orgId: "spoofed-org",
        userId: "spoofed-user",
        userEmail: "spoofed@example.com",
        nested: {
          ok: true,
        },
        error: new Error("monitor exploded"),
      },
    });

    const result = queryObservabilityStore({ kind: "monitor" });

    expect(result.monitorSnapshots).toHaveLength(1);
    expect(result.monitorSnapshots[0].details).toMatchObject({
      nested: {
        ok: true,
      },
      error: {
        name: "Error",
        message: "monitor exploded",
      },
    });
    expect(result.monitorSnapshots[0].details).not.toHaveProperty("orgId");
    expect(result.monitorSnapshots[0].details).not.toHaveProperty("userId");
    expect(result.monitorSnapshots[0].details).not.toHaveProperty("userEmail");
    expect(result.monitorSnapshots[0].details.error).not.toHaveProperty("stack");
  });
});
