import { NextRequest, NextResponse } from "next/server";
import { WorkflowTemplateDetailResponseSchema } from "@entitlement-os/shared";
import { getWorkflowTemplateById } from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
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
    const workflowTemplate = await getWorkflowTemplateById(auth.orgId, id);

    if (!workflowTemplate) {
      return NextResponse.json(
        { error: "Workflow template not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      WorkflowTemplateDetailResponseSchema.parse({
        workflowTemplate,
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
