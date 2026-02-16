import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAgentTraceMetrics,
  resetAgentTraceMetrics,
  StructuredTraceExporter,
} from "../../../src/tracing/exporter.js";

describe("Phase 1 Tracing :: exporter", () => {
  beforeEach(() => {
    resetAgentTraceMetrics();
  });

  it("[MATRIX:tracing:exporter][PACK:metrics] records span latency/error metrics by span bucket", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const exporter = new StructuredTraceExporter();
      await exporter.export([
        {
          type: "trace.span",
          traceId: "trace-1",
          spanId: "span-1",
          startedAt: "2026-02-16T00:00:00.000Z",
          endedAt: "2026-02-16T00:00:00.200Z",
          spanData: {
            type: "tool",
            name: "searchParcels",
            usage: { input_tokens: 12, output_tokens: 4 },
          },
        },
        {
          type: "trace.span",
          traceId: "trace-1",
          spanId: "span-2",
          parentId: "span-1",
          startedAt: "2026-02-16T00:00:01.000Z",
          endedAt: "2026-02-16T00:00:01.400Z",
          spanData: {
            type: "tool",
            name: "searchParcels",
          },
          error: { message: "Tool timed out" },
        },
      ]);
    } finally {
      infoSpy.mockRestore();
      warnSpy.mockRestore();
    }

    expect(getAgentTraceMetrics()).toEqual([
      {
        bucket: "tool:searchParcels",
        count: 2,
        errors: 1,
        p50Ms: 200,
        p95Ms: 400,
      },
    ]);
  });

  it("[MATRIX:tracing:exporter][PACK:logs] emits structured logs for trace + span items", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const exporter = new StructuredTraceExporter();
      await exporter.export([
        {
          type: "trace",
          traceId: "trace-abc",
          name: "agent-run",
          groupId: "conv-123",
        },
        {
          type: "trace.span",
          traceId: "trace-abc",
          spanId: "span-abc",
          startedAt: "2026-02-16T00:00:00.000Z",
          endedAt: "2026-02-16T00:00:00.050Z",
          spanData: {
            type: "agent",
            name: "Coordinator",
          },
        },
      ]);
    } finally {
      warnSpy.mockRestore();
    }

    expect(infoSpy).toHaveBeenCalled();
    const loggedEvents = infoSpy.mock.calls
      .map(([line]) => (typeof line === "string" ? JSON.parse(line) : null))
      .filter((entry): entry is Record<string, unknown> => entry !== null)
      .map((entry) => entry.event);
    expect(loggedEvents).toContain("agent_trace");
    expect(loggedEvents).toContain("agent_trace_span");

    infoSpy.mockRestore();
  });
});
