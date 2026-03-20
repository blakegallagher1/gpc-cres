import { NextRequest, NextResponse } from "next/server";
import { WorkflowTemplateDetailResponseSchema } from "@entitlement-os/shared";

import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { toIsoString } from "@/app/api/_lib/opportunityPhase3";
import * as Sentry from "@sentry/nextjs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const workflowTemplate = await prisma.workflowTemplate.findFirst({
      where: { id, orgId: auth.orgId },
      include: {
        stages: {
          orderBy: { ordinal: "asc" },
        },
      },
    });

    if (!workflowTemplate) {
      return NextResponse.json(
        { error: "Workflow template not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      WorkflowTemplateDetailResponseSchema.parse({
        workflowTemplate: {
          id: workflowTemplate.id,
          orgId: workflowTemplate.orgId,
          key: workflowTemplate.key,
          name: workflowTemplate.name,
          description: workflowTemplate.description,
          isDefault: workflowTemplate.isDefault,
          createdAt: toIsoString(workflowTemplate.createdAt),
          updatedAt: toIsoString(workflowTemplate.updatedAt),
          stages: workflowTemplate.stages.map((stage) => ({
            id: stage.id,
            orgId: stage.orgId,
            templateId: stage.templateId,
            key: stage.key,
            name: stage.name,
            ordinal: stage.ordinal,
            description: stage.description,
            requiredGate: stage.requiredGate,
            createdAt: toIsoString(stage.createdAt),
          })),
        },
      }),
    );
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.workflows", method: "GET" },
    });
    console.error("Error fetching workflow template:", error);
    return NextResponse.json(
      { error: "Failed to fetch workflow template" },
      { status: 500 },
    );
  }
}
