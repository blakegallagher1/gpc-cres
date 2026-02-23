import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("PolicyEngine", () => {
  const ENV_KEYS = [
    "AGENTOS_ENABLED",
    "AGENTOS_POLICY_ENGINE_ENABLED",
    "ALLOW_DB_WRITES",
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

  it("approves when policy engine is disabled", async () => {
    const { PolicyEngine } = await import("./policyEngine.js");
    const engine = new PolicyEngine();
    const decision = engine.evaluate("search_parcels", { query: "SELECT * FROM parcels" });
    expect(decision.action).toBe("approve");
    expect(decision.reason).toContain("disabled");
  });

  it("blocks SQL write in read-only mode", async () => {
    process.env.AGENTOS_ENABLED = "true";
    process.env.AGENTOS_POLICY_ENGINE_ENABLED = "true";
    process.env.ALLOW_DB_WRITES = "false";

    const { PolicyEngine } = await import("./policyEngine.js");
    const engine = new PolicyEngine();
    const decision = engine.evaluate("query_org_sql", {
      query: "INSERT INTO deals (name) VALUES ('test')",
    });

    expect(decision.action).toBe("deny");
    expect(decision.rule).toBe("sql_read_only");
  });

  it("approves SELECT queries in read-only mode", async () => {
    process.env.AGENTOS_ENABLED = "true";
    process.env.AGENTOS_POLICY_ENGINE_ENABLED = "true";

    const { PolicyEngine } = await import("./policyEngine.js");
    const engine = new PolicyEngine();
    const decision = engine.evaluate("query_org_sql", {
      query: "SELECT * FROM deals WHERE org_id = '123'",
    });

    expect(decision.action).toBe("approve");
  });

  it("denies when cost cap is exceeded", async () => {
    process.env.AGENTOS_ENABLED = "true";
    process.env.AGENTOS_POLICY_ENGINE_ENABLED = "true";

    const { PolicyEngine } = await import("./policyEngine.js");
    const engine = new PolicyEngine(2);
    engine.addCost(2.5);

    const decision = engine.evaluate("search_parcels", {});
    expect(decision.action).toBe("deny");
    expect(decision.rule).toBe("cost_cap");
  });

  it("escalates high-risk tools", async () => {
    process.env.AGENTOS_ENABLED = "true";
    process.env.AGENTOS_POLICY_ENGINE_ENABLED = "true";

    const { PolicyEngine } = await import("./policyEngine.js");
    const engine = new PolicyEngine();
    const decision = engine.evaluate("dangerous_tool", {}, { riskLevel: "HIGH" });

    expect(decision.action).toBe("escalate");
    expect(decision.rule).toBe("risk_level_gate");
  });

  it("blocks PII in tool input", async () => {
    process.env.AGENTOS_ENABLED = "true";
    process.env.AGENTOS_POLICY_ENGINE_ENABLED = "true";

    const { PolicyEngine } = await import("./policyEngine.js");
    const engine = new PolicyEngine();
    const decision = engine.evaluate("store_knowledge_entry", {
      content: "Customer SSN is 123-45-6789",
    });

    expect(decision.action).toBe("deny");
    expect(decision.rule).toBe("pii_detection");
  });
});
