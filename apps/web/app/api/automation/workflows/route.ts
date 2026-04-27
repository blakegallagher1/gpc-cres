import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
  OperatorWorkflowValidationError,
  createOperatorWorkflowDefinition,
  listOperatorWorkflowDefinitions,
} from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";

export async function GET(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const workflows = await listOperatorWorkflowDefinitions(auth.orgId);
    return NextResponse.json({ workflows });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.automation.workflows", method: "GET" },
    });
    return NextResponse.json({ error: "Failed to load workflows" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const payload = await request.json();
    const workflow = await createOperatorWorkflowDefinition(auth.orgId, auth.userId, payload);
    return NextResponse.json({ workflow }, { status: 201 });
  } catch (error) {
    if (error instanceof OperatorWorkflowValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    Sentry.captureException(error, {
      tags: { route: "api.automation.workflows", method: "POST" },
    });
    return NextResponse.json({ error: "Failed to create workflow" }, { status: 500 });
  }
}
