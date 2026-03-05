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
    const { dispatchEvent, registerHandler } = await loadModule();
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
});
