import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnabled = process.env.AGENTOS_ENABLED;
const originalContext = process.env.AGENTOS_CONTEXT_MANAGEMENT_ENABLED;
const originalThreshold = process.env.AGENTOS_COMPACTION_THRESHOLD;

describe("sessionManager", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.AGENTOS_ENABLED;
    delete process.env.AGENTOS_CONTEXT_MANAGEMENT_ENABLED;
  });

  afterEach(() => {
    if (originalEnabled === undefined) {
      delete process.env.AGENTOS_ENABLED;
    } else {
      process.env.AGENTOS_ENABLED = originalEnabled;
    }
    if (originalContext === undefined) {
      delete process.env.AGENTOS_CONTEXT_MANAGEMENT_ENABLED;
    } else {
      process.env.AGENTOS_CONTEXT_MANAGEMENT_ENABLED = originalContext;
    }
    if (originalThreshold === undefined) {
      delete process.env.AGENTOS_COMPACTION_THRESHOLD;
    } else {
      process.env.AGENTOS_COMPACTION_THRESHOLD = originalThreshold;
    }
  });

  it("includes previous_response_id when value is a response id", async () => {
    const { buildResponseContinuationParams } = await import("./sessionManager.js");
    const params = buildResponseContinuationParams("resp_123");
    expect(params.previous_response_id).toBe("resp_123");
  });

  it("includes context_management only when feature is enabled", async () => {
    process.env.AGENTOS_ENABLED = "true";
    process.env.AGENTOS_CONTEXT_MANAGEMENT_ENABLED = "true";

    const { getAgentOsConfig } = await import("./config.js");
    getAgentOsConfig({ refresh: true });
    const { buildResponseContinuationParams } = await import("./sessionManager.js");

    const params = buildResponseContinuationParams(null);
    expect(params.context_management).toEqual([
      {
        type: "compaction",
        compact_threshold: 100_000,
      },
    ]);
  });

  it("normalizes response id whitespace and filters invalid context entries", async () => {
    process.env.AGENTOS_ENABLED = "true";
    process.env.AGENTOS_CONTEXT_MANAGEMENT_ENABLED = "true";

    const { getAgentOsConfig } = await import("./config.js");
    getAgentOsConfig({ refresh: true });
    const { buildResponseContinuationParams } = await import("./sessionManager.js");

    const invalidOverride = [
      { type: "compaction", compact_threshold: 5000 },
      { type: "invalid", compact_threshold: 10 },
    ] as unknown as Parameters<typeof buildResponseContinuationParams>[1];

    const params = buildResponseContinuationParams("  resp_whitespace  ", invalidOverride);

    expect(params.previous_response_id).toBe("resp_whitespace");
    expect(params.context_management).toEqual([
      {
        type: "compaction",
        compact_threshold: 5000,
      },
    ]);
  });

  it("does nothing when context override is explicit empty array", async () => {
    process.env.AGENTOS_ENABLED = "true";
    process.env.AGENTOS_CONTEXT_MANAGEMENT_ENABLED = "true";

    const { getAgentOsConfig } = await import("./config.js");
    getAgentOsConfig({ refresh: true });
    const { buildResponseContinuationParams } = await import("./sessionManager.js");

    const params = buildResponseContinuationParams(null, []);
    expect(params.context_management).toBeUndefined();
  });

  it("honors explicit null context management override", async () => {
    process.env.AGENTOS_ENABLED = "true";
    process.env.AGENTOS_CONTEXT_MANAGEMENT_ENABLED = "true";
    process.env.AGENTOS_COMPACTION_THRESHOLD = "50000";

    const { buildResponseContinuationParams } = await import("./sessionManager.js");

    const params = buildResponseContinuationParams(null, null);
    expect(params.context_management).toBeUndefined();
  });

  it("honors compaction disabled via compaction control", async () => {
    process.env.AGENTOS_ENABLED = "true";
    process.env.AGENTOS_CONTEXT_MANAGEMENT_ENABLED = "true";

    const { buildResponseContinuationParams } = await import("./sessionManager.js");

    const params = buildResponseContinuationParams(
      null,
      undefined,
      { enabled: false },
    );
    expect(params.context_management).toBeUndefined();
  });

  it("honors compaction manual strategy via compaction control", async () => {
    process.env.AGENTOS_ENABLED = "true";
    process.env.AGENTOS_CONTEXT_MANAGEMENT_ENABLED = "true";

    const { buildResponseContinuationParams } = await import("./sessionManager.js");

    const params = buildResponseContinuationParams(
      null,
      undefined,
      { strategy: "manual" },
    );
    expect(params.context_management).toBeUndefined();
  });

  it("gives contextManagement precedence over compaction control", async () => {
    process.env.AGENTOS_ENABLED = "true";
    process.env.AGENTOS_CONTEXT_MANAGEMENT_ENABLED = "true";

    const { buildResponseContinuationParams } = await import("./sessionManager.js");

    const params = buildResponseContinuationParams(
      null,
      [
        {
          type: "compaction",
          compact_threshold: 900,
        },
      ],
      { enabled: false },
    );
    expect(params.context_management).toEqual([
      {
        type: "compaction",
        compact_threshold: 900,
      },
    ]);
  });
});
