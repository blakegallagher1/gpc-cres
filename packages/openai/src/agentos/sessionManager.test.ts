import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnabled = process.env.AGENTOS_ENABLED;
const originalContext = process.env.AGENTOS_CONTEXT_MANAGEMENT_ENABLED;

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
    expect(params.context_management).toEqual({ strategy: "compaction" });
  });
});

