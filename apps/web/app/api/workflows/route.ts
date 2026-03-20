import { NextRequest, NextResponse } from "next/server";
import {
  WorkflowTemplateCreateRequestSchema,
  WorkflowTemplateDetailResponseSchema,
  WorkflowTemplateListResponseSchema,
} from "@entitlement-os/shared";

import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { toIsoString } from "@/app/api/_lib/opportunityPhase3";
import * as Sentry from "@sentry/nextjs";

function normalizeWorkflowTemplateCreateBody(body: Record<string, unknown>) {
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

export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workflowTemplates = await prisma.workflowTemplate.findMany({
      where: { orgId: auth.orgId },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });

    return NextResponse.json(
      WorkflowTemplateListResponseSchema.parse({
        workflowTemplates: workflowTemplates.map((workflowTemplate) => ({
          id: workflowTemplate.id,
          orgId: workflowTemplate.orgId,
          key: workflowTemplate.key,
          name: workflowTemplate.name,
          description: workflowTemplate.description,
          isDefault: workflowTemplate.isDefault,
          createdAt: toIsoString(workflowTemplate.createdAt),
          updatedAt: toIsoString(workflowTemplate.updatedAt),
        })),
      }),
    );
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.workflows", method: "GET" },
    });
    console.error("Error fetching workflow templates:", error);
    return NextResponse.json(
      { error: "Failed to fetch workflow templates" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = (await request.json()) as Record<string, unknown>;
    const parsed = WorkflowTemplateCreateRequestSchema.safeParse(
      normalizeWorkflowTemplateCreateBody(rawBody),
    );
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; "),
        },
        { status: 400 },
      );
    }

    if (!parsed.data.key || !parsed.data.name.trim()) {
      return NextResponse.json(
        { error: "key and name are required" },
        { status: 400 },
      );
    }

    const invalidStage = parsed.data.stages.find(
      (stage) => !stage.key || !stage.name.trim() || stage.ordinal === null,
    );
    if (invalidStage) {
      return NextResponse.json(
        { error: "Each workflow stage requires key, name, and ordinal" },
        { status: 400 },
      );
    }

    if (parsed.data.isDefault) {
      await prisma.workflowTemplate.updateMany({
        where: { orgId: auth.orgId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const workflowTemplate = await prisma.workflowTemplate.create({
      data: {
        orgId: auth.orgId,
        key: parsed.data.key,
        name: parsed.data.name,
        description: parsed.data.description,
        isDefault: parsed.data.isDefault,
        stages: {
          create: parsed.data.stages.map((stage) => ({
            orgId: auth.orgId,
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

    return NextResponse.json(
      WorkflowTemplateDetailResponseSchema.parse({
        workflowTemplate: serializeWorkflowTemplate(workflowTemplate),
      }),
      { status: 201 },
    );
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.workflows", method: "POST" },
    });
    console.error("Error creating workflow template:", error);
    return NextResponse.json(
      { error: "Failed to create workflow template" },
      { status: 500 },
    );
  }
}
