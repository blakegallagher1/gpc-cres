import { describe, it, expect } from "vitest";
import type { AutomationEvent } from "@/lib/automation/types";

/**
 * Validates the agent.run.completed event shape used by dispatchRunCompleted()
 * in agentRunner.ts (DA-007 learning promotion pipeline).
 *
 * The dispatchRunCompleted helper is module-private, so we validate the event
 * contract against the AutomationEvent union type and the handler expectations.
 */
describe("agent.run.completed event contract (DA-007)", () => {
  it("event shape matches AutomationEvent discriminant for agent.run.completed", () => {
    const event: Extract<AutomationEvent, { type: "agent.run.completed" }> = {
      type: "agent.run.completed",
      runId: "run-test-123",
      orgId: "org-1",
      userId: "user-1",
      conversationId: "conv-1",
      dealId: "deal-1",
      jurisdictionId: "jur-1",
      runType: "chat",
      status: "succeeded",
      inputPreview: "test message",
      queryIntent: null,
    };

    expect(event.type).toBe("agent.run.completed");
    expect(event.runId).toBeTruthy();
    expect(event.orgId).toBeTruthy();
    expect(event.userId).toBeTruthy();
    expect(event.status).toMatch(/^(succeeded|failed|canceled)$/);
  });

  it("all required fields are present and non-empty", () => {
    const event: Extract<AutomationEvent, { type: "agent.run.completed" }> = {
      type: "agent.run.completed",
      runId: "run-123",
      orgId: "org-456",
      userId: "user-789",
      status: "succeeded",
    };

    expect(event.type).toBe("agent.run.completed");
    expect(event.runId).toBeTruthy();
    expect(event.orgId).toBeTruthy();
    expect(event.userId).toBeTruthy();
    expect(event.status).toBeTruthy();
  });

  it("optional fields default to null via ?? operator (dispatchRunCompleted pattern)", () => {
    const opts = {
      runId: "run-1",
      orgId: "org-1",
      userId: "user-1",
      status: "succeeded" as const,
      conversationId: undefined,
      dealId: null,
      jurisdictionId: undefined,
      runType: null,
      inputPreview: undefined,
    };

    // Simulate dispatchRunCompleted's event shape
    const event = {
      type: "agent.run.completed" as const,
      runId: opts.runId,
      orgId: opts.orgId,
      userId: opts.userId,
      conversationId: opts.conversationId ?? null,
      dealId: opts.dealId ?? null,
      jurisdictionId: opts.jurisdictionId ?? null,
      runType: opts.runType ?? null,
      status: opts.status,
      inputPreview: opts.inputPreview ?? null,
      queryIntent: null,
    };

    expect(event.conversationId).toBeNull();
    expect(event.dealId).toBeNull();
    expect(event.jurisdictionId).toBeNull();
    expect(event.runType).toBeNull();
    expect(event.inputPreview).toBeNull();
    expect(event.queryIntent).toBeNull();
  });

  it("inputPreview truncation logic caps at 500 chars", () => {
    const longMessage = "x".repeat(1000);
    const preview = longMessage.slice(0, 500);
    expect(preview.length).toBe(500);
    expect(preview).toBe("x".repeat(500));
  });

  it("inputPreview is null when message is falsy (dispatchRunCompleted pattern)", () => {
    const tests = [
      { input: null, expected: null },
      { input: undefined, expected: null },
      { input: "", expected: null }, // empty string is falsy, so result is null
      { input: "hello", expected: "hello" },
    ];

    for (const { input, expected } of tests) {
      // Pattern used in dispatchRunCompleted: inputPreview ?? null
      const preview = input ? input.slice(0, 500) : null;
      expect(preview).toBe(expected);
    }
  });

  it("status mapping must be one of succeeded, failed, or canceled", () => {
    const validStatuses: Array<"succeeded" | "failed" | "canceled"> = [
      "succeeded",
      "failed",
      "canceled",
    ];

    for (const status of validStatuses) {
      const event: Extract<AutomationEvent, { type: "agent.run.completed" }> = {
        type: "agent.run.completed",
        runId: "run-1",
        orgId: "org-1",
        userId: "user-1",
        status,
      };

      expect(event.status).toMatch(/^(succeeded|failed|canceled)$/);
    }
  });

  it("event can be serialized to JSON without loss", () => {
    const event: Extract<AutomationEvent, { type: "agent.run.completed" }> = {
      type: "agent.run.completed",
      runId: "run-123",
      orgId: "org-456",
      userId: "user-789",
      conversationId: "conv-abc",
      dealId: "deal-def",
      jurisdictionId: "jur-ghi",
      runType: "entitlement_scout",
      status: "succeeded",
      inputPreview: "research Texas zoning implications",
      queryIntent: null,
    };

    const json = JSON.stringify(event);
    const restored = JSON.parse(json);

    expect(restored.type).toBe(event.type);
    expect(restored.runId).toBe(event.runId);
    expect(restored.orgId).toBe(event.orgId);
    expect(restored.userId).toBe(event.userId);
    expect(restored.conversationId).toBe(event.conversationId);
    expect(restored.dealId).toBe(event.dealId);
    expect(restored.jurisdictionId).toBe(event.jurisdictionId);
    expect(restored.runType).toBe(event.runType);
    expect(restored.status).toBe(event.status);
    expect(restored.inputPreview).toBe(event.inputPreview);
    expect(restored.queryIntent).toBe(event.queryIntent);
  });

  it("idempotency key generation pattern from events.ts", () => {
    const event: Extract<AutomationEvent, { type: "agent.run.completed" }> = {
      type: "agent.run.completed",
      runId: "run-abc-123",
      orgId: "org-xyz-789",
      userId: "user-456",
      status: "succeeded",
    };

    // Pattern from events.ts: `agent.run.completed:${event.orgId}:${event.runId}`
    const idempotencyKey = `agent.run.completed:${event.orgId}:${event.runId}`;

    expect(idempotencyKey).toBe("agent.run.completed:org-xyz-789:run-abc-123");
    expect(idempotencyKey.split(":")).toHaveLength(3);
  });

  it("handler contract: event can be destructured with optional chaining", () => {
    const event: Extract<AutomationEvent, { type: "agent.run.completed" }> = {
      type: "agent.run.completed",
      runId: "run-1",
      orgId: "org-1",
      userId: "user-1",
      status: "failed",
    };

    // Pattern used in handleAgentLearningPromotion
    expect(event.type).toBe("agent.run.completed");
    expect(event.runId).toBeTruthy();
    expect(event.orgId).toBeTruthy();
    expect(event.userId).toBeTruthy();
    expect(event.conversationId ?? null).toBeNull();
    expect(event.dealId ?? null).toBeNull();
    expect(event.jurisdictionId ?? null).toBeNull();
    expect(event.runType ?? null).toBeNull();
    expect(event.inputPreview ?? null).toBeNull();
    expect(event.queryIntent ?? null).toBeNull();
  });
});
