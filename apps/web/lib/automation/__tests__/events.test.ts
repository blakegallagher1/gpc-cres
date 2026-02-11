import {
  dispatchEvent,
  registerHandler,
  _resetHandlers,
  type AutomationEvent,
} from "../events";

describe("events", () => {
  beforeEach(() => {
    _resetHandlers();
  });

  describe("dispatchEvent", () => {
    it("should be fire-and-forget (handler errors do not propagate)", async () => {
      const errorHandler = vi.fn(async () => {
        throw new Error("Handler error");
      });

      registerHandler("parcel.created", errorHandler);

      const event: AutomationEvent = {
        type: "parcel.created",
        dealId: "deal-1",
        parcelId: "parcel-1",
        orgId: "org-1",
      };

      // Should not throw even though handler throws
      await expect(dispatchEvent(event)).resolves.toBeUndefined();
      expect(errorHandler).toHaveBeenCalled();
    });

    it("should handle unregistered event types as silent no-op", async () => {
      const event: AutomationEvent = {
        type: "parcel.created",
        dealId: "deal-1",
        parcelId: "parcel-1",
        orgId: "org-1",
      };

      // No handlers registered, should not throw
      await expect(dispatchEvent(event)).resolves.toBeUndefined();
    });

    it("should pass correct event data to handler", async () => {
      const handler = vi.fn();
      registerHandler("parcel.enriched", handler);

      const event: AutomationEvent = {
        type: "parcel.enriched",
        dealId: "deal-456",
        parcelId: "parcel-789",
        orgId: "org-123",
      };

      await dispatchEvent(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it("should call multiple handlers for the same event type", async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      registerHandler("triage.completed", handler1);
      registerHandler("triage.completed", handler2);
      registerHandler("triage.completed", handler3);

      const event: AutomationEvent = {
        type: "triage.completed",
        dealId: "deal-1",
        runId: "run-1",
        decision: "ADVANCE",
        orgId: "org-1",
      };

      await dispatchEvent(event);

      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
      expect(handler3).toHaveBeenCalledWith(event);
    });

    it("should continue executing other handlers if one throws", async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn(async () => {
        throw new Error("Handler 2 error");
      });
      const handler3 = vi.fn();

      registerHandler("task.created", handler1);
      registerHandler("task.created", handler2);
      registerHandler("task.created", handler3);

      const event: AutomationEvent = {
        type: "task.created",
        dealId: "deal-1",
        taskId: "task-1",
        orgId: "org-1",
      };

      await dispatchEvent(event);

      // All handlers should have been called despite handler2 throwing
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(handler3).toHaveBeenCalled();
    });

    it("should handle async handlers", async () => {
      const asyncHandler = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return "done";
      });

      registerHandler("task.completed", asyncHandler);

      const event: AutomationEvent = {
        type: "task.completed",
        dealId: "deal-1",
        taskId: "task-1",
        orgId: "org-1",
      };

      await dispatchEvent(event);

      expect(asyncHandler).toHaveBeenCalledWith(event);
    });

    it("should not throw when dispatching with no handlers", async () => {
      const event: AutomationEvent = {
        type: "deal.statusChanged",
        dealId: "deal-1",
        from: "INTAKE",
        to: "TRIAGE_DONE",
        orgId: "org-1",
      };

      await expect(dispatchEvent(event)).resolves.toBeUndefined();
    });
  });

  describe("registerHandler", () => {
    it("should register handler successfully", () => {
      const handler = vi.fn();

      expect(() => {
        registerHandler("upload.created", handler);
      }).not.toThrow();
    });

    it("should allow multiple handlers for the same event type", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      expect(() => {
        registerHandler("intake.received", handler1);
        registerHandler("intake.received", handler2);
      }).not.toThrow();
    });

    it("should allow handlers for different event types", () => {
      const parcelHandler = vi.fn();
      const triageHandler = vi.fn();
      const taskHandler = vi.fn();

      expect(() => {
        registerHandler("parcel.created", parcelHandler);
        registerHandler("triage.completed", triageHandler);
        registerHandler("task.created", taskHandler);
      }).not.toThrow();
    });

    it("should allow the same handler function to be registered multiple times", () => {
      const handler = vi.fn();

      expect(() => {
        registerHandler("parcel.created", handler);
        registerHandler("parcel.created", handler);
        registerHandler("parcel.enriched", handler);
      }).not.toThrow();
    });
  });

  describe("event type definitions", () => {
    it("should accept parcel.created event", async () => {
      const event: AutomationEvent = {
        type: "parcel.created",
        dealId: "deal-1",
        parcelId: "parcel-1",
        orgId: "org-1",
      };
      await expect(dispatchEvent(event)).resolves.toBeUndefined();
    });

    it("should accept parcel.enriched event", async () => {
      const event: AutomationEvent = {
        type: "parcel.enriched",
        dealId: "deal-1",
        parcelId: "parcel-1",
        orgId: "org-1",
      };
      await expect(dispatchEvent(event)).resolves.toBeUndefined();
    });

    it("should accept triage.completed event", async () => {
      const event: AutomationEvent = {
        type: "triage.completed",
        dealId: "deal-1",
        runId: "run-1",
        decision: "ADVANCE",
        orgId: "org-1",
      };
      await expect(dispatchEvent(event)).resolves.toBeUndefined();
    });

    it("should accept task.created event", async () => {
      const event: AutomationEvent = {
        type: "task.created",
        dealId: "deal-1",
        taskId: "task-1",
        orgId: "org-1",
      };
      await expect(dispatchEvent(event)).resolves.toBeUndefined();
    });

    it("should accept task.completed event", async () => {
      const event: AutomationEvent = {
        type: "task.completed",
        dealId: "deal-1",
        taskId: "task-1",
        orgId: "org-1",
      };
      await expect(dispatchEvent(event)).resolves.toBeUndefined();
    });

    it("should accept deal.statusChanged event", async () => {
      const event: AutomationEvent = {
        type: "deal.statusChanged",
        dealId: "deal-1",
        from: "INTAKE",
        to: "TRIAGE_DONE",
        orgId: "org-1",
      };
      await expect(dispatchEvent(event)).resolves.toBeUndefined();
    });

    it("should accept upload.created event", async () => {
      const event: AutomationEvent = {
        type: "upload.created",
        dealId: "deal-1",
        uploadId: "upload-1",
        orgId: "org-1",
      };
      await expect(dispatchEvent(event)).resolves.toBeUndefined();
    });

    it("should accept intake.received event", async () => {
      const event: AutomationEvent = {
        type: "intake.received",
        source: "email",
        content: "123 Main St",
        orgId: "org-1",
      };
      await expect(dispatchEvent(event)).resolves.toBeUndefined();
    });
  });

  describe("handler execution order", () => {
    it("should execute handlers in registration order", async () => {
      const executionOrder: number[] = [];

      const handler1 = vi.fn(async () => {
        executionOrder.push(1);
      });
      const handler2 = vi.fn(async () => {
        executionOrder.push(2);
      });
      const handler3 = vi.fn(async () => {
        executionOrder.push(3);
      });

      registerHandler("parcel.created", handler1);
      registerHandler("parcel.created", handler2);
      registerHandler("parcel.created", handler3);

      const event: AutomationEvent = {
        type: "parcel.created",
        dealId: "deal-1",
        parcelId: "parcel-1",
        orgId: "org-1",
      };

      await dispatchEvent(event);

      expect(executionOrder).toEqual([1, 2, 3]);
    });
  });

  describe("event data validation", () => {
    it("should handle events with all required fields", async () => {
      const handler = vi.fn();
      registerHandler("triage.completed", handler);

      const event: AutomationEvent = {
        type: "triage.completed",
        dealId: "deal-456",
        runId: "run-789",
        decision: "ADVANCE",
        orgId: "org-123",
      };

      await dispatchEvent(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it("should handle intake.received with source and content", async () => {
      const handler = vi.fn();
      registerHandler("intake.received", handler);

      const event: AutomationEvent = {
        type: "intake.received",
        source: "email",
        content: "New property at 123 Main St, Baton Rouge",
        orgId: "org-1",
      };

      await dispatchEvent(event);

      expect(handler).toHaveBeenCalledWith(event);
    });
  });
});
