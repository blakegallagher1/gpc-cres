import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
  OperatorWorkflowValidationError,
  getOperatorWorkflowDefinition,
  updateOperatorWorkflowDefinition,
} from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const workflow = await getOperatorWorkflowDefinition(auth.orgId, id);
    if (!workflow) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    return NextResponse.json({ workflow });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.automation.workflows.id", method: "GET" },
    });
    return NextResponse.json({ error: "Failed to load workflow" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const payload = await request.json();
    const workflow = await updateOperatorWorkflowDefinition(auth.orgId, id, payload);
    if (!workflow) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    return NextResponse.json({ workflow });
  } catch (error) {
    if (error instanceof OperatorWorkflowValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    Sentry.captureException(error, {
      tags: { route: "api.automation.workflows.id", method: "PATCH" },
    });
    return NextResponse.json({ error: "Failed to update workflow" }, { status: 500 });
  }
}
