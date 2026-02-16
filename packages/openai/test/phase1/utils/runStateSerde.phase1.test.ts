import { describe, expect, it } from "vitest";
import {
  deserializeRunStateEnvelope,
  serializeRunStateEnvelope,
} from "../../../src/utils/runStateSerde.js";

describe("runStateSerde", () => {
  it("serializes envelope with checkpoint metadata", () => {
    const envelope = serializeRunStateEnvelope({
      serializedRunState: "state-blob",
      checkpoint: {
        kind: "tool_completion",
        at: "2026-02-16T00:00:00.000Z",
        runId: "run-123",
        toolName: "search_parcels",
      },
    });

    expect(envelope).toEqual({
      version: 1,
      serializedRunState: "state-blob",
      checkpoint: {
        kind: "tool_completion",
        at: "2026-02-16T00:00:00.000Z",
        runId: "run-123",
        toolName: "search_parcels",
      },
    });
  });

  it("round-trips valid envelope", () => {
    const payload = {
      version: 1,
      serializedRunState: "state-blob",
      checkpoint: {
        kind: "resume_request",
        at: "2026-02-16T00:00:00.000Z",
        runId: "run-123",
        correlationId: "corr-1",
      },
    };

    expect(deserializeRunStateEnvelope(payload)).toEqual(payload);
  });

  it("rejects invalid payload shape", () => {
    expect(
      deserializeRunStateEnvelope({
        version: 2,
        serializedRunState: "state-blob",
        checkpoint: { kind: "tool_completion", at: "now" },
      }),
    ).toBeNull();
    expect(
      deserializeRunStateEnvelope({
        version: 1,
        serializedRunState: "",
        checkpoint: { kind: "tool_completion", at: "now" },
      }),
    ).toBeNull();
  });
});
