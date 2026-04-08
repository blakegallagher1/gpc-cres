import { NextRequest, NextResponse } from "next/server";
import {
  WorkflowTemplateDetailResponseSchema,
  WorkflowTemplateListResponseSchema,
} from "@entitlement-os/shared";

import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  createWorkflowTemplate,
  listWorkflowTemplates,
  WorkflowTemplateValidationError,
} from "@gpc/server/workflows/workflow-template.service";
import * as Sentry from "@sentry/nextjs";

export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workflowTemplates = await listWorkflowTemplates(auth.orgId);

    return NextResponse.json(
      WorkflowTemplateListResponseSchema.parse({
        workflowTemplates,
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
    const workflowTemplate = await createWorkflowTemplate(auth.orgId, rawBody);

    return NextResponse.json(
      WorkflowTemplateDetailResponseSchema.parse({
        workflowTemplate,
      }),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof WorkflowTemplateValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
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
