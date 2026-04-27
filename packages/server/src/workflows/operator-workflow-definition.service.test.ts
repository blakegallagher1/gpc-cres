import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  definitionFindManyMock,
  definitionFindFirstMock,
  definitionCreateMock,
  definitionUpdateMock,
  executionCreateMock,
  executionUpdateMock,
} = vi.hoisted(() => ({
  definitionFindManyMock: vi.fn(),
  definitionFindFirstMock: vi.fn(),
  definitionCreateMock: vi.fn(),
  definitionUpdateMock: vi.fn(),
  executionCreateMock: vi.fn(),
  executionUpdateMock: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    operatorWorkflowDefinition: {
      findMany: definitionFindManyMock,
      findFirst: definitionFindFirstMock,
      create: definitionCreateMock,
      update: definitionUpdateMock,
    },
    workflowExecution: {
      create: executionCreateMock,
      update: executionUpdateMock,
    },
  },
  Prisma: {},
}));

vi.mock("./workflow-orchestrator.service", async (importOriginal) => {
  const original = await importOriginal<typeof import("./workflow-orchestrator.service")>();
  return {
    ...original,
    runWorkflowSync: vi.fn(),
  };
});

import {
  createOperatorWorkflowDefinition,
  listOperatorWorkflowDefinitions,
  runOperatorWorkflowDefinition,
  updateOperatorWorkflowDefinition,
} from "./operator-workflow-definition.service";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";
const NOW = new Date("2026-04-27T12:00:00.000Z");

function makeDefinitionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    orgId: ORG_ID,
    name: "Saved workflow",
    description: "Durable operator workflow",
    nodes: [{ id: "start", type: "start", data: { label: "Start" } }],
    edges: [],
    runType: "TRIAGE",
    runMessage: "Run saved workflow",
    executionTemplateKey: null,
    source: "custom",
    createdBy: USER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("operator workflow definitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists org-scoped persisted definitions", async () => {
    definitionFindManyMock.mockResolvedValue([makeDefinitionRow()]);

    const result = await listOperatorWorkflowDefinitions(ORG_ID);

    expect(definitionFindManyMock).toHaveBeenCalledWith({
      where: { orgId: ORG_ID },
      orderBy: { updatedAt: "desc" },
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: "22222222-2222-4222-8222-222222222222",
        orgId: ORG_ID,
        name: "Saved workflow",
        nodes: [{ id: "start", type: "start", data: { label: "Start" } }],
        updatedAt: "2026-04-27T12:00:00.000Z",
      }),
    ]);
  });

  it("creates a validated definition for the auth org", async () => {
    definitionCreateMock.mockResolvedValue(makeDefinitionRow({ name: "New workflow" }));

    const result = await createOperatorWorkflowDefinition(ORG_ID, USER_ID, {
      name: "New workflow",
      nodes: [{ id: "start" }],
      edges: [],
      runType: "TRIAGE",
      runMessage: "Run it",
    });

    expect(result.name).toBe("New workflow");
    expect(definitionCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: ORG_ID,
        createdBy: USER_ID,
        name: "New workflow",
        runMessage: "Run it",
      }),
    });
  });

  it("updates only an existing org-scoped definition", async () => {
    definitionFindFirstMock.mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222" });
    definitionUpdateMock.mockResolvedValue(makeDefinitionRow({ name: "Updated" }));

    const result = await updateOperatorWorkflowDefinition(ORG_ID, "22222222-2222-4222-8222-222222222222", {
      name: "Updated",
    });

    expect(result?.name).toBe("Updated");
    expect(definitionFindFirstMock).toHaveBeenCalledWith({
      where: { id: "22222222-2222-4222-8222-222222222222", orgId: ORG_ID },
      select: { id: true },
    });
    expect(definitionUpdateMock).toHaveBeenCalledWith({
      where: { id: "22222222-2222-4222-8222-222222222222" },
      data: { name: "Updated" },
    });
  });

  it("runs a generic workflow through workflow execution history", async () => {
    definitionFindFirstMock.mockResolvedValue(makeDefinitionRow());
    executionCreateMock.mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      orgId: ORG_ID,
      dealId: null,
      templateKey: "OPERATOR_WORKFLOW",
      status: "running",
      currentStepKey: "prepare_operator_workflow",
      stepsTotal: 1,
      stepsCompleted: 0,
      input: {},
      output: {},
      stepResults: [],
      error: null,
      errorStepKey: null,
      startedBy: USER_ID,
      startedAt: NOW,
      completedAt: null,
      durationMs: null,
    });
    executionUpdateMock.mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      orgId: ORG_ID,
      dealId: null,
      templateKey: "OPERATOR_WORKFLOW",
      status: "completed",
      currentStepKey: null,
      stepsTotal: 1,
      stepsCompleted: 1,
      input: {},
      output: { name: "Saved workflow" },
      stepResults: [],
      error: null,
      errorStepKey: null,
      startedBy: USER_ID,
      startedAt: NOW,
      completedAt: NOW,
      durationMs: 1,
    });

    const result = await runOperatorWorkflowDefinition({
      orgId: ORG_ID,
      definitionId: "22222222-2222-4222-8222-222222222222",
      startedBy: USER_ID,
    });

    expect(result.status).toBe("completed");
    expect(result.templateKey).toBe("OPERATOR_WORKFLOW");
    expect(executionCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: ORG_ID,
        templateKey: "OPERATOR_WORKFLOW",
        status: "running",
      }),
    });
    expect(executionUpdateMock).toHaveBeenCalledWith({
      where: { id: "33333333-3333-4333-8333-333333333333" },
      data: expect.objectContaining({
        status: "completed",
        stepsCompleted: 1,
      }),
    });
  });
});
