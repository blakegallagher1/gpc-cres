import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z, ZodError } from "zod";
import { runOperatorWorkflowDefinition } from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const RunWorkflowSchema = z.object({
  dealId: z.string().uuid().nullable().optional(),
  inputData: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: z.infer<typeof RunWorkflowSchema>;
  try {
    payload = RunWorkflowSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid payload", issues: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id } = await params;
  try {
    const execution = await runOperatorWorkflowDefinition({
      orgId: auth.orgId,
      definitionId: id,
      dealId: payload.dealId ?? null,
      startedBy: auth.userId,
      inputData: payload.inputData,
    });
    const status = execution.status === "completed" ? 200 : 500;
    return NextResponse.json({ execution }, { status });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.automation.workflows.run", method: "POST" },
    });
    const message = error instanceof Error ? error.message : "Failed to run workflow";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
