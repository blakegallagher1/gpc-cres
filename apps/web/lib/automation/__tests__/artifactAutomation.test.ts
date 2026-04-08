import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  prismaMock,
  renderArtifactFromSpecMock,
  uploadArtifactToGatewayMock,
  systemAuthMock,
  createAutomationTaskMock,
  getAutomationDealContextMock,
  getCurrentWorkflowStageMock,
  getWorkflowPipelineStepMock,
  captureAutomationTimeoutMock,
} = vi.hoisted(() => ({
  prismaMock: {
    deal: { findFirst: vi.fn() },
    run: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    artifact: { findFirst: vi.fn(), create: vi.fn() },
    orgMembership: { findMany: vi.fn() },
    notification: { createMany: vi.fn() },
  },
  renderArtifactFromSpecMock: vi.fn(),
  uploadArtifactToGatewayMock: vi.fn(),
  systemAuthMock: vi.fn(),
  createAutomationTaskMock: vi.fn(),
  getAutomationDealContextMock: vi.fn(),
  getCurrentWorkflowStageMock: vi.fn(),
  getWorkflowPipelineStepMock: vi.fn(),
  captureAutomationTimeoutMock: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@entitlement-os/artifacts", () => ({
  renderArtifactFromSpec: renderArtifactFromSpecMock,
}));

vi.mock("@gpc/server/services/gateway-storage.service", () => ({
  uploadArtifactToGateway: uploadArtifactToGatewayMock,
  systemAuth: systemAuthMock,
}));

vi.mock("@gpc/server/automation/notifications", () => ({
  createAutomationTask: createAutomationTaskMock,
}));

vi.mock("@gpc/server/automation/context", () => ({
  getAutomationDealContext: getAutomationDealContextMock,
  getCurrentWorkflowStage: getCurrentWorkflowStageMock,
  getWorkflowPipelineStep: getWorkflowPipelineStepMock,
}));

vi.mock("@gpc/server/automation/sentry", () => ({
  captureAutomationTimeout: captureAutomationTimeoutMock,
}));

import {
  handleArtifactOnStatusChange,
  handleTriageArtifactNotification,
} from "../artifactAutomation";

function buildDeal() {
  return {
    id: "deal-1",
    orgId: "org-1",
    name: "Deal 1",
    sku: "TRUCK_PARKING",
    parcels: [
      {
        address: "123 Main St",
        apn: null,
        acreage: { toString: () => "1.0" },
        currentZoning: "C2",
        floodZone: null,
      },
    ],
    jurisdiction: {
      name: "East Baton Rouge",
      state: "LA",
    },
  };
}

describe("artifact automation timeouts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    getAutomationDealContextMock.mockResolvedValue({
      dealId: "deal-1",
      orgId: "org-1",
      name: "Deal 1",
      sku: "TRUCK_PARKING",
      jurisdictionId: "jur-1",
      status: "EXIT_MARKETED",
      strategy: "DISPOSITION",
      workflowTemplateKey: "DISPOSITION",
      currentStageKey: "DISPOSITION",
      templateStages: [],
    });
    getCurrentWorkflowStageMock.mockReturnValue({
      key: "DISPOSITION",
      name: "Disposition",
      ordinal: 7,
      description: null,
      requiredGate: null,
    });
    getWorkflowPipelineStepMock.mockReturnValue(7);
    prismaMock.run.create.mockResolvedValue({ id: "run-1" });
    prismaMock.run.update.mockResolvedValue(undefined);
    prismaMock.run.findFirst.mockResolvedValue({ outputJson: null });
    prismaMock.artifact.findFirst.mockResolvedValue(null);
    prismaMock.orgMembership.findMany.mockResolvedValue([]);
    prismaMock.notification.createMany.mockResolvedValue(undefined);
    createAutomationTaskMock.mockResolvedValue({ id: "task-1" });
    systemAuthMock.mockReturnValue({ orgId: "org-1", userId: "system-user" });
  });

  it("marks buyer teaser generation for manual review when rendering times out", async () => {
    vi.useFakeTimers();
    prismaMock.deal.findFirst.mockResolvedValue(buildDeal());
    renderArtifactFromSpecMock.mockReturnValue(new Promise(() => {}));

    const promise = handleArtifactOnStatusChange({
      type: "deal.stageChanged",
      dealId: "deal-1",
      from: "UNDERWRITING",
      to: "DISPOSITION",
      orgId: "org-1",
    });

    await vi.advanceTimersByTimeAsync(15_000);
    await expect(promise).resolves.toBeUndefined();

    expect(captureAutomationTimeoutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        handler: "artifactAutomation",
        label: "BUYER_TEASER_PDF render timed out after 15000ms",
      }),
    );
    expect(createAutomationTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        dealId: "deal-1",
        type: "document_review",
        title: "Buyer Teaser generation timed out",
        pipelineStep: 7,
      }),
    );
    expect(prismaMock.run.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: {
        status: "failed",
        finishedAt: expect.any(Date),
        error: "BUYER_TEASER_PDF render timed out after 15000ms",
      },
    });
    expect(uploadArtifactToGatewayMock).not.toHaveBeenCalled();
    expect(prismaMock.artifact.create).not.toHaveBeenCalled();
  });

  it("does not create an artifact record when triage upload times out", async () => {
    vi.useFakeTimers();
    prismaMock.artifact.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prismaMock.deal.findFirst.mockResolvedValue(buildDeal());
    prismaMock.run.findFirst.mockResolvedValue({
      outputJson: {
        decision: "ADVANCE",
        next_actions: [],
      },
    });
    renderArtifactFromSpecMock.mockResolvedValue({
      filename: "triage.pdf",
      contentType: "application/pdf",
      bytes: new Uint8Array([1, 2, 3]),
    });
    uploadArtifactToGatewayMock.mockReturnValue(new Promise(() => {}));

    const promise = handleTriageArtifactNotification({
      type: "triage.completed",
      dealId: "deal-1",
      runId: "triage-run-1",
      decision: "ADVANCE",
      orgId: "org-1",
    });

    await vi.advanceTimersByTimeAsync(10_000);
    await expect(promise).resolves.toBeUndefined();

    expect(captureAutomationTimeoutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        handler: "artifactAutomation",
        label: "TRIAGE_PDF upload timed out after 10000ms",
      }),
    );
    expect(createAutomationTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        dealId: "deal-1",
        type: "document_review",
        title: "Triage Report upload timed out",
      }),
    );
    expect(prismaMock.run.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: {
        status: "failed",
        finishedAt: expect.any(Date),
        error: "TRIAGE_PDF upload timed out after 10000ms",
      },
    });
    expect(prismaMock.artifact.create).not.toHaveBeenCalled();
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
  });
});
