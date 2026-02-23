import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("ToolOrchestrator", () => {
  const ENV_KEYS = [
    "AGENTOS_ENABLED",
    "AGENTOS_POLICY_ENGINE_ENABLED",
    "AGENTOS_SELF_REPAIR_ENABLED",
    "AGENTOS_TOOL_OUTPUT_TRIMMER_ENABLED",
    "AGENTOS_DYNAMIC_TOOL_REGISTRY_ENABLED",
  ] as const;

  const originalEnv: Partial<Record<string, string>> = {};
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
  }

  beforeEach(() => {
    vi.resetModules();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const original = originalEnv[key];
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
  });

  it("is a transparent pass-through when all flags are off", async () => {
    const { ToolOrchestrator } = await import("./orchestrator.js");
    const orchestrator = new ToolOrchestrator();
    const executeFn = vi.fn(async () => "tool result");

    const result = await orchestrator.execute(
      "search_parcels",
      { query: "test" },
      executeFn,
      { orgId: "org-1" },
    );

    expect(result.output).toBe("tool result");
    expect(result.policyDecision.action).toBe("approve");
    expect(result.repaired).toBe(false);
    expect(result.trimmed).toBe(false);
    expect(executeFn).toHaveBeenCalledTimes(1);
  });

  it("passes errors through when self-repair is off", async () => {
    const { ToolOrchestrator } = await import("./orchestrator.js");
    const orchestrator = new ToolOrchestrator();
    const executeFn = vi.fn(async () => {
      throw new Error("tool failed");
    });

    await expect(
      orchestrator.execute(
        "search_parcels",
        { query: "test" },
        executeFn,
        { orgId: "org-1" },
      ),
    ).rejects.toThrow("tool failed");
  });

  it("records latency even on success with no features", async () => {
    const { ToolOrchestrator } = await import("./orchestrator.js");
    const orchestrator = new ToolOrchestrator();
    const executeFn = vi.fn(async () => "ok");

    const result = await orchestrator.execute(
      "get_deal_context",
      {},
      executeFn,
      { orgId: "org-1" },
    );

    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.output).toBe("ok");
  });

  it("denies tool when policy engine blocks", async () => {
    process.env.AGENTOS_ENABLED = "true";
    process.env.AGENTOS_POLICY_ENGINE_ENABLED = "true";

    const { ToolOrchestrator } = await import("./orchestrator.js");
    const orchestrator = new ToolOrchestrator({ costCapUsd: 1 });
    orchestrator["policyEngine"].addCost(2);

    const executeFn = vi.fn(async () => "should not reach");
    const result = await orchestrator.execute(
      "search_parcels",
      {},
      executeFn,
      { orgId: "org-1" },
    );

    expect(result.policyDecision.action).toBe("deny");
    expect(executeFn).not.toHaveBeenCalled();
  });
});
