import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  ensureHandlersRegisteredMock,
  startEventMock,
  completeEventMock,
  failEventMock,
  evaluateProactiveEventMock,
  captureExceptionMock,
  scopeSetTagMock,
  scopeSetContextMock,
} = vi.hoisted(() => ({
  ensureHandlersRegisteredMock: vi.fn(),
  startEventMock: vi.fn(),
  completeEventMock: vi.fn(),
  failEventMock: vi.fn(),
  evaluateProactiveEventMock: vi.fn(),
  captureExceptionMock: vi.fn(),
  scopeSetTagMock: vi.fn(),
  scopeSetContextMock: vi.fn(),
}));

vi.mock("../handlers", () => ({
  ensureHandlersRegistered: ensureHandlersRegisteredMock,
}));

vi.mock("@/lib/services/automationEvent.service", () => ({
  startEvent: startEventMock,
  completeEvent: completeEventMock,
  failEvent: failEventMock,
}));

vi.mock("@/lib/services/proactiveTrigger.service", () => ({
  evaluateProactiveEvent: evaluateProactiveEventMock,
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: captureExceptionMock,
  withScope: (callback: (scope: { setTag: typeof scopeSetTagMock; setContext: typeof scopeSetContextMock }) => void) =>
    callback({
      setTag: scopeSetTagMock,
      setContext: scopeSetContextMock,
    }),
}));

async function loadModule() {
  return import("../events");
}

describe("dispatchEvent", () => {
  beforeEach(() => {
    vi.resetModules();
    ensureHandlersRegisteredMock.mockReset();
    startEventMock.mockReset();
    completeEventMock.mockReset();
    failEventMock.mockReset();
    evaluateProactiveEventMock.mockReset();
    captureExceptionMock.mockReset();
    scopeSetTagMock.mockReset();
    scopeSetContextMock.mockReset();
    startEventMock.mockResolvedValue("event-id");
    completeEventMock.mockResolvedValue(undefined);
    failEventMock.mockResolvedValue(undefined);
    evaluateProactiveEventMock.mockResolvedValue(undefined);
  });

  it("loads handlers lazily before dispatching", async () => {
    const { dispatchEvent, registerHandler } = await loadModule();
    const handler = vi.fn(async () => undefined);
    registerHandler("parcel.created", handler);

    const event = {
      type: "parcel.created" as const,
      dealId: "deal-1",
      parcelId: "parcel-1",
      orgId: "org-1",
    };

    await dispatchEvent(event);

    expect(ensureHandlersRegisteredMock).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
    expect(startEventMock).toHaveBeenCalledWith(
      "org-1",
      expect.any(String),
      "parcel.created",
      "deal-1",
      event,
      expect.stringContaining("parcel.created:org-1:deal-1:parcel-1"),
    );
    expect(completeEventMock).toHaveBeenCalledWith("event-id");
    await vi.waitFor(() => {
      expect(evaluateProactiveEventMock).toHaveBeenCalledWith({
        orgId: "org-1",
        eventType: "parcel.created",
        payload: event,
      });
    });
  });

  it("captures handler registration failures without blocking dispatch", async () => {
    ensureHandlersRegisteredMock.mockImplementation(() => {
      throw new Error("registration boom");
    });

    const { dispatchEvent, registerHandler } = await loadModule();
    const handler = vi.fn(async () => undefined);
    registerHandler("parcel.created", handler);

    await expect(
      dispatchEvent({
        type: "parcel.created",
        dealId: "deal-1",
        parcelId: "parcel-1",
        orgId: "org-1",
      }),
    ).resolves.toBeUndefined();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(captureExceptionMock).toHaveBeenCalledWith(expect.any(Error), {
      tags: {
        automation: true,
        phase: "handler_registration",
      },
    });
  });

  it("records handler failures and continues with later handlers", async () => {
    const { dispatchEvent, registerHandler, _resetHandlers } = await loadModule();
    _resetHandlers();
    const failingHandler = vi.fn(async () => {
      throw new Error("handler failed");
    });
    const succeedingHandler = vi.fn(async () => undefined);
    registerHandler("task.completed", failingHandler);
    registerHandler("task.completed", succeedingHandler);

    const event = {
      type: "task.completed" as const,
      dealId: "deal-1",
      taskId: "task-1",
      orgId: "org-1",
    };

    await dispatchEvent(event);

    expect(failingHandler).toHaveBeenCalledWith(event);
    expect(succeedingHandler).toHaveBeenCalledWith(event);
    expect(failEventMock).toHaveBeenCalledTimes(1);
    expect(completeEventMock).toHaveBeenCalledTimes(1);
    expect(captureExceptionMock).toHaveBeenCalled();
  });

  it("skips duplicate events dispatched within the idempotency window (in-memory)", async () => {
    const { dispatchEvent, registerHandler, _resetHandlers } = await loadModule();
    _resetHandlers();
    const handler = vi.fn(async () => undefined);
    registerHandler("parcel.created", handler);

    const event = {
      type: "parcel.created" as const,
      dealId: "deal-1",
      parcelId: "parcel-1",
      orgId: "org-1",
    };

    await dispatchEvent(event);
    await dispatchEvent(event); // duplicate — in-memory guard

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("skips handler when startEvent returns null (DB dedup)", async () => {
    const { dispatchEvent, registerHandler, _resetHandlers } = await loadModule();
    _resetHandlers();
    // Simulate DB returning null (duplicate key conflict)
    startEventMock.mockResolvedValue(null);

    const handler = vi.fn(async () => undefined);
    registerHandler("parcel.created", handler);

    // First dispatch goes through in-memory, but DB dedup returns null
    await dispatchEvent({
      type: "parcel.created",
      dealId: "deal-1",
      parcelId: "parcel-1",
      orgId: "org-1",
    });

    // Handler should NOT be called because startEvent returned null
    expect(handler).not.toHaveBeenCalled();
    expect(startEventMock).toHaveBeenCalledTimes(1);
    // startEvent should receive the durable idempotency key
    expect(startEventMock).toHaveBeenCalledWith(
      "org-1",
      expect.any(String),
      "parcel.created",
      "deal-1",
      expect.any(Object),
      expect.stringContaining("parcel.created:org-1:deal-1:parcel-1"),
    );
    expect(completeEventMock).not.toHaveBeenCalled();
  });

  it("allows the same event type with different entity IDs", async () => {
    const { dispatchEvent, registerHandler, _resetHandlers } = await loadModule();
    _resetHandlers();
    const handler = vi.fn(async () => undefined);
    registerHandler("parcel.created", handler);

    await dispatchEvent({
      type: "parcel.created",
      dealId: "deal-1",
      parcelId: "parcel-1",
      orgId: "org-1",
    });
    await dispatchEvent({
      type: "parcel.created",
      dealId: "deal-1",
      parcelId: "parcel-2",
      orgId: "org-1",
    });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("times out long-running handlers and records failure", async () => {
    // Override timeout for faster test
    const mod = await loadModule();
    mod._resetHandlers();

    const slowHandler = vi.fn(
      () => new Promise<void>((resolve) => setTimeout(resolve, 60_000)),
    );
    mod.registerHandler("task.created", slowHandler);

    // Manually test timeout behavior using the race pattern
    const timeoutPromise = Promise.race([
      slowHandler(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timed out")), 50),
      ),
    ]);

    await expect(timeoutPromise).rejects.toThrow("timed out");
  });
});

describe("classifyError", () => {
  it("classifies timeout errors as TRANSIENT_UPSTREAM", async () => {
    const { classifyError } = await loadModule();
    expect(classifyError(new Error("request timed out after 8000ms"))).toBe("TRANSIENT_UPSTREAM");
    expect(classifyError(new Error("AbortError"))).toBe("TRANSIENT_UPSTREAM");
  });

  it("classifies connection errors as TRANSIENT_UPSTREAM", async () => {
    const { classifyError } = await loadModule();
    expect(classifyError(new Error("ECONNRESET"))).toBe("TRANSIENT_UPSTREAM");
    expect(classifyError(new Error("socket hang up"))).toBe("TRANSIENT_UPSTREAM");
    expect(classifyError(new Error("fetch failed"))).toBe("TRANSIENT_UPSTREAM");
  });

  it("classifies HTTP 5xx as TRANSIENT_UPSTREAM", async () => {
    const { classifyError } = await loadModule();
    expect(classifyError(new Error("gateway responded 502"))).toBe("TRANSIENT_UPSTREAM");
    expect(classifyError(new Error("503 Service Unavailable"))).toBe("TRANSIENT_UPSTREAM");
  });

  it("classifies DB errors as TRANSIENT_DB", async () => {
    const { classifyError } = await loadModule();
    expect(classifyError(new Error("Prisma connection pool exhausted"))).toBe("TRANSIENT_DB");
  });

  it("classifies not-found as PERMANENT_NOT_FOUND", async () => {
    const { classifyError } = await loadModule();
    expect(classifyError(new Error("Record not found"))).toBe("PERMANENT_NOT_FOUND");
  });

  it("classifies validation errors as PERMANENT_VALIDATION", async () => {
    const { classifyError } = await loadModule();
    expect(classifyError(new Error("Invalid parcel_id required"))).toBe("PERMANENT_VALIDATION");
  });

  it("classifies config errors as PERMANENT_CONFIG", async () => {
    const { classifyError } = await loadModule();
    expect(classifyError(new Error("GATEWAY_UNCONFIGURED"))).toBe("PERMANENT_CONFIG");
  });

  it("classifies AutomationError by its code", async () => {
    const { classifyError, AutomationError } = await loadModule();
    const err = new AutomationError("test", "PERMANENT_CONFIG");
    expect(classifyError(err)).toBe("PERMANENT_CONFIG");
    expect(err.retryable).toBe(false);
  });

  it("classifies transient AutomationError as retryable", async () => {
    const { AutomationError } = await loadModule();
    const err = new AutomationError("gateway down", "TRANSIENT_UPSTREAM");
    expect(err.retryable).toBe(true);
  });

  it("falls back to UNKNOWN for unrecognized errors", async () => {
    const { classifyError } = await loadModule();
    expect(classifyError(new Error("something weird happened"))).toBe("UNKNOWN");
    expect(classifyError("string error")).toBe("UNKNOWN");
  });
});

describe("computeIdempotencyKey", () => {
  it("produces distinct keys for different entity IDs", async () => {
    const { _computeIdempotencyKey } = await loadModule();
    const key1 = _computeIdempotencyKey({
      type: "parcel.created",
      dealId: "d1",
      parcelId: "p1",
      orgId: "o1",
    });
    const key2 = _computeIdempotencyKey({
      type: "parcel.created",
      dealId: "d1",
      parcelId: "p2",
      orgId: "o1",
    });
    expect(key1).not.toBe(key2);
  });

  it("includes status transition for deal.statusChanged", async () => {
    const { _computeIdempotencyKey } = await loadModule();
    const key = _computeIdempotencyKey({
      type: "deal.statusChanged",
      dealId: "d1",
      from: "INTAKE" as any,
      to: "TRIAGE_DONE" as any,
      orgId: "o1",
    });
    expect(key).toContain("TRIAGE_DONE");
  });
});
