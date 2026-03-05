import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  registerHandlerMock,
  handleParcelCreatedMock,
  handleTriageReadinessMock,
  handleTaskCreatedMock,
  handleTaskCompletedMock,
  handleUploadCreatedMock,
  handleAdvancementMock,
  handleStatusChangeReminderMock,
  handleBuyerOutreachMock,
  handleTriageBuyerMatchMock,
  handleIntakeReceivedMock,
  handleArtifactOnStatusChangeMock,
  handleTriageArtifactNotificationMock,
  handleEntitlementStrategyAutopilotMock,
  handleKnowledgeCaptureMock,
  handleFinancialInitMock,
  handleOutcomeCaptureMock,
} = vi.hoisted(() => ({
  registerHandlerMock: vi.fn(),
  handleParcelCreatedMock: vi.fn(),
  handleTriageReadinessMock: vi.fn(),
  handleTaskCreatedMock: vi.fn(),
  handleTaskCompletedMock: vi.fn(),
  handleUploadCreatedMock: vi.fn(),
  handleAdvancementMock: vi.fn(),
  handleStatusChangeReminderMock: vi.fn(),
  handleBuyerOutreachMock: vi.fn(),
  handleTriageBuyerMatchMock: vi.fn(),
  handleIntakeReceivedMock: vi.fn(),
  handleArtifactOnStatusChangeMock: vi.fn(),
  handleTriageArtifactNotificationMock: vi.fn(),
  handleEntitlementStrategyAutopilotMock: vi.fn(),
  handleKnowledgeCaptureMock: vi.fn(),
  handleFinancialInitMock: vi.fn(),
  handleOutcomeCaptureMock: vi.fn(),
}));

vi.mock("../events", () => ({
  registerHandler: registerHandlerMock,
}));

vi.mock("../enrichment", () => ({
  handleParcelCreated: handleParcelCreatedMock,
}));

vi.mock("../triage", () => ({
  handleTriageReadiness: handleTriageReadinessMock,
}));

vi.mock("../taskExecution", () => ({
  handleTaskCreated: handleTaskCreatedMock,
  handleTaskCompleted: handleTaskCompletedMock,
}));

vi.mock("../documents", () => ({
  handleUploadCreated: handleUploadCreatedMock,
}));

vi.mock("../advancement", () => ({
  handleAdvancement: handleAdvancementMock,
  handleStatusChangeReminder: handleStatusChangeReminderMock,
}));

vi.mock("../buyerOutreach", () => ({
  handleBuyerOutreach: handleBuyerOutreachMock,
  handleTriageBuyerMatch: handleTriageBuyerMatchMock,
}));

vi.mock("../intake", () => ({
  handleIntakeReceived: handleIntakeReceivedMock,
}));

vi.mock("../artifactAutomation", () => ({
  handleArtifactOnStatusChange: handleArtifactOnStatusChangeMock,
  handleTriageArtifactNotification: handleTriageArtifactNotificationMock,
}));

vi.mock("../entitlementStrategy", () => ({
  handleEntitlementStrategyAutopilot: handleEntitlementStrategyAutopilotMock,
}));

vi.mock("../knowledgeCapture", () => ({
  handleKnowledgeCapture: handleKnowledgeCaptureMock,
}));

vi.mock("../financialInit", () => ({
  handleFinancialInit: handleFinancialInitMock,
}));

vi.mock("../outcomeCapture", () => ({
  handleOutcomeCapture: handleOutcomeCaptureMock,
}));

async function loadModule() {
  return import("../handlers");
}

describe("ensureHandlersRegistered", () => {
  beforeEach(() => {
    vi.resetModules();
    registerHandlerMock.mockReset();
  });

  it("registers the expected handlers in order", async () => {
    const { ensureHandlersRegistered } = await loadModule();

    ensureHandlersRegistered();

    expect(registerHandlerMock.mock.calls).toEqual([
      ["parcel.created", handleParcelCreatedMock],
      ["parcel.enriched", handleTriageReadinessMock],
      ["task.created", handleTaskCreatedMock],
      ["task.completed", handleTaskCompletedMock],
      ["task.completed", handleAdvancementMock],
      ["deal.statusChanged", handleStatusChangeReminderMock],
      ["upload.created", handleUploadCreatedMock],
      ["deal.statusChanged", handleBuyerOutreachMock],
      ["triage.completed", handleTriageBuyerMatchMock],
      ["intake.received", handleIntakeReceivedMock],
      ["deal.statusChanged", handleArtifactOnStatusChangeMock],
      ["triage.completed", handleTriageArtifactNotificationMock],
      ["deal.statusChanged", handleEntitlementStrategyAutopilotMock],
      ["triage.completed", handleFinancialInitMock],
      ["deal.statusChanged", handleKnowledgeCaptureMock],
      ["deal.statusChanged", handleOutcomeCaptureMock],
    ]);
  });

  it("is idempotent across repeated calls", async () => {
    const { ensureHandlersRegistered } = await loadModule();

    ensureHandlersRegistered();
    ensureHandlersRegistered();

    expect(registerHandlerMock).toHaveBeenCalledTimes(16);
  });
});
