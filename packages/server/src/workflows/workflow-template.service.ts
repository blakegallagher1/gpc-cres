import "server-only";

import { prisma } from "@entitlement-os/db";

import { WorkflowTemplateCreateRequestSchema } from "@entitlement-os/shared";

export class WorkflowTemplateValidationError extends Error {}

type WorkflowTemplateCreateBody = Record<string, unknown>;

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeWorkflowTemplateCreateBody(body: WorkflowTemplateCreateBody) {
  return {
    key: typeof body.key === "string" ? body.key : null,
    name: typeof body.name === "string" ? body.name : "",
    description: typeof body.description === "string" ? body.description : null,
    isDefault: body.isDefault === true,
    stages: Array.isArray(body.stages)
      ? body.stages.map((stage, index) => {
          const candidate =
            stage && typeof stage === "object"
              ? (stage as Record<string, unknown>)
              : {};
          return {
            key: typeof candidate.key === "string" ? candidate.key : null,
            name: typeof candidate.name === "string" ? candidate.name : "",
            ordinal:
              typeof candidate.ordinal === "number"
                ? candidate.ordinal
                : index + 1,
            description:
              typeof candidate.description === "string"
                ? candidate.description
                : null,
            requiredGate:
              typeof candidate.requiredGate === "string"
                ? candidate.requiredGate
                : null,
          };
        })
      : [],
  };
}

function serializeWorkflowTemplate(
  workflowTemplate: {
    id: string;
    orgId: string;
    key: string;
    name: string;
    description: string | null;
    isDefault: boolean;
    createdAt: Date | string;
    updatedAt: Date | string;
    stages?: Array<{
      id: string;
      orgId: string;
      templateId: string;
      key: string;
      name: string;
      ordinal: number;
      description: string | null;
      requiredGate: string | null;
      createdAt: Date | string;
    }>;
  },
) {
  return {
    id: workflowTemplate.id,
    orgId: workflowTemplate.orgId,
    key: workflowTemplate.key,
    name: workflowTemplate.name,
    description: workflowTemplate.description,
    isDefault: workflowTemplate.isDefault,
    createdAt: toIsoString(workflowTemplate.createdAt),
    updatedAt: toIsoString(workflowTemplate.updatedAt),
    stages:
      workflowTemplate.stages?.map((stage) => ({
        id: stage.id,
        orgId: stage.orgId,
        templateId: stage.templateId,
        key: stage.key,
        name: stage.name,
        ordinal: stage.ordinal,
        description: stage.description,
        requiredGate: stage.requiredGate,
        createdAt: toIsoString(stage.createdAt),
      })) ?? [],
  };
}

export async function listWorkflowTemplates(orgId: string) {
  const workflowTemplates = await prisma.workflowTemplate.findMany({
    where: { orgId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });

  return workflowTemplates.map((workflowTemplate) => ({
    id: workflowTemplate.id,
    orgId: workflowTemplate.orgId,
    key: workflowTemplate.key,
    name: workflowTemplate.name,
    description: workflowTemplate.description,
    isDefault: workflowTemplate.isDefault,
    createdAt: toIsoString(workflowTemplate.createdAt),
    updatedAt: toIsoString(workflowTemplate.updatedAt),
  }));
}

export async function getWorkflowTemplateById(orgId: string, id: string) {
  const workflowTemplate = await prisma.workflowTemplate.findFirst({
    where: { id, orgId },
    include: {
      stages: {
        orderBy: { ordinal: "asc" },
      },
    },
  });

  return workflowTemplate ? serializeWorkflowTemplate(workflowTemplate) : null;
}

export async function createWorkflowTemplate(
  orgId: string,
  rawBody: WorkflowTemplateCreateBody,
) {
  const parsed = WorkflowTemplateCreateRequestSchema.safeParse(
    normalizeWorkflowTemplateCreateBody(rawBody),
  );

  if (!parsed.success) {
    throw new WorkflowTemplateValidationError(
      parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    );
  }

  if (!parsed.data.key || !parsed.data.name.trim()) {
    throw new WorkflowTemplateValidationError("key and name are required");
  }

  const invalidStage = parsed.data.stages.find(
    (stage) => !stage.key || !stage.name.trim() || stage.ordinal === null,
  );
  if (invalidStage) {
    throw new WorkflowTemplateValidationError(
      "Each workflow stage requires key, name, and ordinal",
    );
  }

  if (parsed.data.isDefault) {
    await prisma.workflowTemplate.updateMany({
      where: { orgId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const workflowTemplate = await prisma.workflowTemplate.create({
    data: {
      orgId,
      key: parsed.data.key,
      name: parsed.data.name,
      description: parsed.data.description,
      isDefault: parsed.data.isDefault,
      stages: {
        create: parsed.data.stages.map((stage) => ({
          orgId,
          key: stage.key!,
          name: stage.name,
          ordinal: stage.ordinal!,
          description: stage.description,
          requiredGate: stage.requiredGate,
        })),
      },
    },
    include: {
      stages: {
        orderBy: { ordinal: "asc" },
      },
    },
  });

  return serializeWorkflowTemplate(workflowTemplate);
}
