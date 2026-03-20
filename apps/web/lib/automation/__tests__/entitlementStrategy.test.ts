const { runEntitlementStrategyAutopilotMock } = vi.hoisted(() => ({
  runEntitlementStrategyAutopilotMock: vi.fn(),
}));
const { captureAutomationTimeoutMock } = vi.hoisted(() => ({
  captureAutomationTimeoutMock: vi.fn(),
}));

vi.mock("@/lib/services/entitlementStrategyAutopilot.service", () => ({
  runEntitlementStrategyAutopilot: runEntitlementStrategyAutopilotMock,
}));
vi.mock("../sentry", () => ({
  captureAutomationTimeout: captureAutomationTimeoutMock,
}));

const {
  getAutomationDealContextMock,
  isEntitlementStrategyMock,
} = vi.hoisted(() => ({
  getAutomationDealContextMock: vi.fn(),
  isEntitlementStrategyMock: vi.fn(),
}));

vi.mock("../context", () => ({
  getAutomationDealContext: getAutomationDealContextMock,
  isEntitlementStrategy: isEntitlementStrategyMock,
}));

import { handleEntitlementStrategyAutopilot } from "../entitlementStrategy";

describe("handleEntitlementStrategyAutopilot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    getAutomationDealContextMock.mockResolvedValue({
      dealId: "deal-1",
      orgId: "org-1",
      name: "Deal 1",
      sku: "SMALL_BAY_FLEX",
      jurisdictionId: "jur-1",
      status: "PREAPP",
      strategy: "ENTITLEMENT",
      workflowTemplateKey: "ENTITLEMENT_LAND",
      currentStageKey: "UNDERWRITING",
      templateStages: [],
    });
    isEntitlementStrategyMock.mockReturnValue(true);
  });

  it("ignores non deal.statusChanged events", async () => {
    await handleEntitlementStrategyAutopilot({
      type: "task.created",
      dealId: "deal-1",
      taskId: "task-1",
      orgId: "org-1",
    });

    expect(runEntitlementStrategyAutopilotMock).not.toHaveBeenCalled();
  });

  it("ignores status changes outside PREAPP/CONCEPT", async () => {
    await handleEntitlementStrategyAutopilot({
      type: "deal.statusChanged",
      dealId: "deal-1",
      from: "TRIAGE_DONE",
      to: "HEARING",
      orgId: "org-1",
    });

    expect(runEntitlementStrategyAutopilotMock).not.toHaveBeenCalled();
  });

  it("ignores non-entitlement deals", async () => {
    isEntitlementStrategyMock.mockReturnValue(false);

    await handleEntitlementStrategyAutopilot({
      type: "deal.statusChanged",
      dealId: "deal-1",
      from: "TRIAGE_DONE",
      to: "PREAPP",
      orgId: "org-1",
    });

    expect(runEntitlementStrategyAutopilotMock).not.toHaveBeenCalled();
  });

  it("runs autopilot for PREAPP transitions", async () => {
    runEntitlementStrategyAutopilotMock.mockResolvedValue({
      success: true,
    });

    await handleEntitlementStrategyAutopilot({
      type: "deal.statusChanged",
      dealId: "deal-1",
      from: "TRIAGE_DONE",
      to: "PREAPP",
      orgId: "org-1",
    });

    expect(runEntitlementStrategyAutopilotMock).toHaveBeenCalledTimes(1);
    expect(runEntitlementStrategyAutopilotMock).toHaveBeenCalledWith({
      orgId: "org-1",
      dealId: "deal-1",
      materializeTasks: true,
    });
  });

  it("swallows failures and logs automation error", async () => {
    runEntitlementStrategyAutopilotMock.mockRejectedValue(new Error("boom"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await handleEntitlementStrategyAutopilot({
      type: "deal.statusChanged",
      dealId: "deal-1",
      from: "PREAPP",
      to: "CONCEPT",
      orgId: "org-1",
    });

    expect(runEntitlementStrategyAutopilotMock).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain("Entitlement strategy autopilot failed");

    errorSpy.mockRestore();
  });

  it("skips silently when the autopilot times out", async () => {
    vi.useFakeTimers();
    runEntitlementStrategyAutopilotMock.mockReturnValue(new Promise(() => {}));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const promise = handleEntitlementStrategyAutopilot({
      type: "deal.statusChanged",
      dealId: "deal-1",
      from: "PREAPP",
      to: "CONCEPT",
      orgId: "org-1",
    });

    await vi.advanceTimersByTimeAsync(25_000);
    await expect(promise).resolves.toBeUndefined();

    expect(captureAutomationTimeoutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        handler: "entitlementStrategy",
        label: "runEntitlementStrategyAutopilot timed out after 25000ms",
      }),
    );
    expect(errorSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
