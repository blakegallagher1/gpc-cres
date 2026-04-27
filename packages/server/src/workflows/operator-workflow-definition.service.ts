import { prisma, Prisma } from "@entitlement-os/db";
import { z } from "zod";
import {
  type StartWorkflowInput,
  type WorkflowExecutionRecord,
  type WorkflowTemplateKey,
  runWorkflowSync,
} from "./workflow-orchestrator.service";

const OPERATOR_WORKFLOW_TEMPLATE_KEY = "OPERATOR_WORKFLOW";
const MAX_WORKFLOW_NODES = 50;
const MAX_WORKFLOW_EDGES = 100;

const NodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().optional(),
  data: z.unknown().optional(),
  position: z.unknown().optional(),
}).passthrough();

const EdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  type: z.string().optional(),
  data: z.unknown().optional(),
}).passthrough();

const ExecutionTemplateKeySchema = z.enum(["QUICK_SCREEN", "ACQUISITION_PATH"]);

const DefinitionInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1_000).nullable().optional(),
  nodes: z.array(NodeSchema).max(MAX_WORKFLOW_NODES).default([]),
  edges: z.array(EdgeSchema).max(MAX_WORKFLOW_EDGES).default([]),
  runType: z.string().trim().min(1).max(80).default("TRIAGE"),
  runMessage: z.string().trim().min(1).max(2_000),
  executionTemplateKey: ExecutionTemplateKeySchema.nullable().optional(),
  source: z.enum(["template", "custom"]).default("custom"),
});

const DefinitionUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1_000).nullable().optional(),
  nodes: z.array(NodeSchema).max(MAX_WORKFLOW_NODES).optional(),
  edges: z.array(EdgeSchema).max(MAX_WORKFLOW_EDGES).optional(),
  runType: z.string().trim().min(1).max(80).optional(),
  runMessage: z.string().trim().min(1).max(2_000).optional(),
  executionTemplateKey: ExecutionTemplateKeySchema.nullable().optional(),
  source: z.enum(["template", "custom"]).optional(),
});

export class OperatorWorkflowValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperatorWorkflowValidationError";
  }
}

export interface OperatorWorkflowDefinitionRecord {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  nodes: unknown[];
  edges: unknown[];
  runType: string;
  runMessage: string;
  executionTemplateKey: WorkflowTemplateKey | null;
  source: "template" | "custom";
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RunOperatorWorkflowInput {
  orgId: string;
  definitionId: string;
  dealId?: string | null;
  startedBy: string | null;
  inputData?: Record<string, unknown>;
}

function parseDefinitionInput(input: unknown) {
  const parsed = DefinitionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new OperatorWorkflowValidationError(parsed.error.issues[0]?.message ?? "Invalid workflow definition");
  }
  return parsed.data;
}

function parseDefinitionUpdate(input: unknown) {
  const parsed = DefinitionUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new OperatorWorkflowValidationError(parsed.error.issues[0]?.message ?? "Invalid workflow definition");
  }
  return parsed.data;
}

function normalizeSource(source: string): "template" | "custom" {
  return source === "template" ? "template" : "custom";
}

function normalize(row: {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  nodes: unknown;
  edges: unknown;
  runType: string;
  runMessage: string;
  executionTemplateKey: string | null;
  source: string;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}): OperatorWorkflowDefinitionRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    description: row.description,
    nodes: Array.isArray(row.nodes) ? row.nodes : [],
    edges: Array.isArray(row.edges) ? row.edges : [],
    runType: row.runType,
    runMessage: row.runMessage,
    executionTemplateKey: ExecutionTemplateKeySchema.safeParse(row.executionTemplateKey).success
      ? (row.executionTemplateKey as WorkflowTemplateKey)
      : null,
    source: normalizeSource(row.source),
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listOperatorWorkflowDefinitions(
  orgId: string,
): Promise<OperatorWorkflowDefinitionRecord[]> {
  const rows = await prisma.operatorWorkflowDefinition.findMany({
    where: { orgId },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(normalize);
}

export async function getOperatorWorkflowDefinition(
  orgId: string,
  id: string,
): Promise<OperatorWorkflowDefinitionRecord | null> {
  const row = await prisma.operatorWorkflowDefinition.findFirst({
    where: { id, orgId },
  });
  return row ? normalize(row) : null;
}

export async function createOperatorWorkflowDefinition(
  orgId: string,
  createdBy: string | null,
  input: unknown,
): Promise<OperatorWorkflowDefinitionRecord> {
  const parsed = parseDefinitionInput(input);
  const row = await prisma.operatorWorkflowDefinition.create({
    data: {
      orgId,
      name: parsed.name,
      description: parsed.description ?? null,
      nodes: parsed.nodes as unknown as Prisma.InputJsonValue,
      edges: parsed.edges as unknown as Prisma.InputJsonValue,
      runType: parsed.runType,
      runMessage: parsed.runMessage,
      executionTemplateKey: parsed.executionTemplateKey ?? null,
      source: parsed.source,
      createdBy,
    },
  });
  return normalize(row);
}

export async function updateOperatorWorkflowDefinition(
  orgId: string,
  id: string,
  input: unknown,
): Promise<OperatorWorkflowDefinitionRecord | null> {
  const parsed = parseDefinitionUpdate(input);
  const existing = await prisma.operatorWorkflowDefinition.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) return null;

  const row = await prisma.operatorWorkflowDefinition.update({
    where: { id },
    data: {
      ...(parsed.name !== undefined ? { name: parsed.name } : {}),
      ...(parsed.description !== undefined ? { description: parsed.description } : {}),
      ...(parsed.nodes !== undefined ? { nodes: parsed.nodes as unknown as Prisma.InputJsonValue } : {}),
      ...(parsed.edges !== undefined ? { edges: parsed.edges as unknown as Prisma.InputJsonValue } : {}),
      ...(parsed.runType !== undefined ? { runType: parsed.runType } : {}),
      ...(parsed.runMessage !== undefined ? { runMessage: parsed.runMessage } : {}),
      ...(parsed.executionTemplateKey !== undefined
        ? { executionTemplateKey: parsed.executionTemplateKey }
        : {}),
      ...(parsed.source !== undefined ? { source: parsed.source } : {}),
    },
  });
  return normalize(row);
}

export async function runOperatorWorkflowDefinition(
  input: RunOperatorWorkflowInput,
): Promise<WorkflowExecutionRecord> {
  const definition = await getOperatorWorkflowDefinition(input.orgId, input.definitionId);
  if (!definition) throw new Error("Workflow definition not found");

  if (definition.executionTemplateKey && input.dealId) {
    const workflowInput: StartWorkflowInput = {
      orgId: input.orgId,
      dealId: input.dealId,
      templateKey: definition.executionTemplateKey,
      startedBy: input.startedBy,
      inputData: {
        ...(input.inputData ?? {}),
        operatorWorkflowDefinitionId: definition.id,
      },
    };
    return runWorkflowSync(workflowInput);
  }

  return runGenericOperatorWorkflow(input, definition);
}

async function runGenericOperatorWorkflow(
  input: RunOperatorWorkflowInput,
  definition: OperatorWorkflowDefinitionRecord,
): Promise<WorkflowExecutionRecord> {
  const startedAtMs = Date.now();
  const created = await prisma.workflowExecution.create({
    data: {
      orgId: input.orgId,
      dealId: input.dealId ?? null,
      templateKey: OPERATOR_WORKFLOW_TEMPLATE_KEY,
      status: "running",
      stepsTotal: Math.max(definition.nodes.length, 1),
      stepsCompleted: 0,
      currentStepKey: "prepare_operator_workflow",
      input: {
        ...(input.inputData ?? {}),
        operatorWorkflowDefinitionId: definition.id,
      } as Prisma.InputJsonValue,
      output: {} as Prisma.InputJsonValue,
      stepResults: [] as Prisma.InputJsonValue,
      startedBy: input.startedBy,
    },
  });

  const stepResults = buildGenericStepResults(definition, created.startedAt);
  const updated = await prisma.workflowExecution.update({
    where: { id: created.id },
    data: {
      status: "completed",
      currentStepKey: null,
      stepsCompleted: stepResults.length,
      stepResults: stepResults as unknown as Prisma.InputJsonValue,
      output: {
        operatorWorkflowDefinitionId: definition.id,
        name: definition.name,
        runType: definition.runType,
        runMessage: definition.runMessage,
        nodeCount: definition.nodes.length,
        edgeCount: definition.edges.length,
      } as Prisma.InputJsonValue,
      completedAt: new Date(),
      durationMs: Date.now() - startedAtMs,
    },
  });

  return {
    id: updated.id,
    orgId: updated.orgId,
    dealId: updated.dealId,
    templateKey: updated.templateKey,
    status: updated.status as WorkflowExecutionRecord["status"],
    currentStepKey: updated.currentStepKey,
    stepsTotal: updated.stepsTotal,
    stepsCompleted: updated.stepsCompleted,
    input: (updated.input ?? {}) as Record<string, unknown>,
    output: (updated.output ?? {}) as Record<string, unknown>,
    stepResults: stepResults as WorkflowExecutionRecord["stepResults"],
    error: updated.error,
    errorStepKey: updated.errorStepKey,
    startedBy: updated.startedBy,
    startedAt: updated.startedAt.toISOString(),
    completedAt: updated.completedAt?.toISOString() ?? null,
    durationMs: updated.durationMs,
  };
}

function buildGenericStepResults(
  definition: OperatorWorkflowDefinitionRecord,
  startedAt: Date,
): WorkflowExecutionRecord["stepResults"] {
  const nodes = definition.nodes.length > 0 ? definition.nodes : [{ id: "start", type: "start" }];
  return nodes.map((node, index) => {
    const record = typeof node === "object" && node !== null ? node as Record<string, unknown> : {};
    const key = typeof record.id === "string" ? record.id : `node_${index + 1}`;
    const label = getNodeLabel(record, key);
    return {
      key,
      label,
      status: "ok",
      startedAt: startedAt.toISOString(),
      completedAt: new Date(startedAt.getTime() + index).toISOString(),
      durationMs: 0,
      output: {
        type: typeof record.type === "string" ? record.type : "workflow_node",
        action: "recorded",
      },
    };
  });
}

function getNodeLabel(record: Record<string, unknown>, fallback: string): string {
  const data = record.data;
  if (typeof data === "object" && data !== null) {
    const label = (data as Record<string, unknown>).label;
    if (typeof label === "string" && label.trim().length > 0) return label;
  }
  return fallback;
}
