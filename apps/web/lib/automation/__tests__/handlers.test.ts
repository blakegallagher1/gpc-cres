import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  registerHandlerMock,
  registerChatAnalysisAuditHandlerMock,
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
  handleAgentLearningPromotionMock,
  handleAgentLearningOutcomeReinforcementMock,
} = vi.hoisted(() => ({
  registerHandlerMock: vi.fn(),
  registerChatAnalysisAuditHandlerMock: vi.fn(),
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
  handleAgentLearningPromotionMock: vi.fn(),
  handleAgentLearningOutcomeReinforcementMock: vi.fn(),
}));

vi.mock("@gpc/server/automation/types", () => ({
  registerHandler: registerHandlerMock,
}));

vi.mock("@gpc/server/automation/enrichment", () => ({
  handleParcelCreated: handleParcelCreatedMock,
}));

vi.mock("@gpc/server/automation/triage", () => ({
  handleTriageReadiness: handleTriageReadinessMock,
}));

vi.mock("@gpc/server/automation/taskExecution", () => ({
  handleTaskCreated: handleTaskCreatedMock,
  handleTaskCompleted: handleTaskCompletedMock,
}));

vi.mock("@gpc/server/automation/documents", () => ({
  handleUploadCreated: handleUploadCreatedMock,
}));

vi.mock("@gpc/server/automation/advancement.service", () => ({
  handleAdvancement: handleAdvancementMock,
  handleStatusChangeReminder: handleStatusChangeReminderMock,
}));

vi.mock("@gpc/server/automation/buyerOutreach", () => ({
  handleBuyerOutreach: handleBuyerOutreachMock,
  handleTriageBuyerMatch: handleTriageBuyerMatchMock,
}));

vi.mock("@gpc/server/automation/intake", () => ({
  handleIntakeReceived: handleIntakeReceivedMock,
}));

vi.mock("@gpc/server/automation/artifactAutomation", () => ({
  handleArtifactOnStatusChange: handleArtifactOnStatusChangeMock,
  handleTriageArtifactNotification: handleTriageArtifactNotificationMock,
}));

vi.mock("@gpc/server/automation/entitlementStrategy", () => ({
  handleEntitlementStrategyAutopilot: handleEntitlementStrategyAutopilotMock,
}));

vi.mock("@gpc/server/automation/knowledgeCapture", () => ({
  handleKnowledgeCapture: handleKnowledgeCaptureMock,
}));

vi.mock("@gpc/server/automation/financialInit", () => ({
  handleFinancialInit: handleFinancialInitMock,
}));

vi.mock("@gpc/server/automation/outcomeCapture", () => ({
  handleOutcomeCapture: handleOutcomeCaptureMock,
}));

vi.mock("@gpc/server/automation/agentLearningPromotion", () => ({
  handleAgentLearningPromotion: handleAgentLearningPromotionMock,
}));

vi.mock("@gpc/server/automation/agentLearningOutcomeReinforcement", () => ({
  handleAgentLearningOutcomeReinforcement:
    handleAgentLearningOutcomeReinforcementMock,
}));

vi.mock("@gpc/server/automation/chat-bridge", () => ({
  registerChatAnalysisAuditHandler: registerChatAnalysisAuditHandlerMock,
}));

async function loadModule() {
  return import("../handlers");
}

describe("ensureHandlersRegistered", () => {
  beforeEach(() => {
    vi.resetModules();
    registerHandlerMock.mockReset();
    registerChatAnalysisAuditHandlerMock.mockReset();
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
      ["deal.stageChanged", handleStatusChangeReminderMock],
      ["upload.created", handleUploadCreatedMock],
      ["deal.stageChanged", handleBuyerOutreachMock],
      ["triage.completed", handleTriageBuyerMatchMock],
      ["intake.received", handleIntakeReceivedMock],
      ["deal.stageChanged", handleArtifactOnStatusChangeMock],
      ["triage.completed", handleTriageArtifactNotificationMock],
      ["deal.stageChanged", handleEntitlementStrategyAutopilotMock],
      ["triage.completed", handleFinancialInitMock],
      ["deal.stageChanged", handleKnowledgeCaptureMock],
      ["deal.stageChanged", handleOutcomeCaptureMock],
      ["deal.stageChanged", handleAgentLearningOutcomeReinforcementMock],
      ["agent.run.completed", handleAgentLearningPromotionMock],
    ]);
    expect(registerChatAnalysisAuditHandlerMock).toHaveBeenCalledTimes(1);
  });

  it("is idempotent across repeated calls", async () => {
    const { ensureHandlersRegistered } = await loadModule();

    ensureHandlersRegistered();
    ensureHandlersRegistered();

    expect(registerHandlerMock).toHaveBeenCalledTimes(18);
    expect(registerChatAnalysisAuditHandlerMock).toHaveBeenCalledTimes(1);
  });
});
