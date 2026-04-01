import { describe, expect, it } from "vitest";
import { shouldMirrorTelemetryToLocalErrorLog } from "./client-error-log";
import type { ClientTelemetryEvent } from "./client-telemetry";

function base(overrides: Partial<ClientTelemetryEvent>): ClientTelemetryEvent {
  return {
    kind: "navigation",
    occurredAt: new Date().toISOString(),
    route: "/",
    viewId: "v",
    sessionId: "s",
    ...overrides,
  };
}

describe("shouldMirrorTelemetryToLocalErrorLog", () => {
  it("includes page, browser, and rejection events", () => {
    expect(shouldMirrorTelemetryToLocalErrorLog(base({ kind: "page_error" }))).toBe(true);
    expect(shouldMirrorTelemetryToLocalErrorLog(base({ kind: "browser_error" }))).toBe(true);
    expect(shouldMirrorTelemetryToLocalErrorLog(base({ kind: "unhandled_rejection" }))).toBe(true);
  });

  it("includes fetch failures and map_metric errors", () => {
    expect(shouldMirrorTelemetryToLocalErrorLog(base({ kind: "fetch_failure" }))).toBe(true);
    expect(
      shouldMirrorTelemetryToLocalErrorLog(base({ kind: "map_metric", level: "error" })),
    ).toBe(true);
    expect(
      shouldMirrorTelemetryToLocalErrorLog(base({ kind: "map_metric", level: "info" })),
    ).toBe(false);
  });

  it("excludes navigation and non-error map metrics", () => {
    expect(shouldMirrorTelemetryToLocalErrorLog(base({ kind: "navigation" }))).toBe(false);
  });
});
