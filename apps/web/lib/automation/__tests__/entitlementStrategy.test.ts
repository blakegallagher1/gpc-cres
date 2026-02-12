const { runEntitlementStrategyAutopilotMock } = vi.hoisted(() => ({
  runEntitlementStrategyAutopilotMock: vi.fn(),
}));

vi.mock("@/lib/services/entitlementStrategyAutopilot.service", () => ({
  runEntitlementStrategyAutopilot: runEntitlementStrategyAutopilotMock,
}));

import { handleEntitlementStrategyAutopilot } from "../entitlementStrategy";

describe("handleEntitlementStrategyAutopilot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
