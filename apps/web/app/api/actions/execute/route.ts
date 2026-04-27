import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";
import {
  runWorkflowSync,
  type WorkflowTemplateKey,
} from "@gpc/server/workflows/workflow-orchestrator.service";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const ActionIdSchema = z.enum(["SCREEN_PARCEL", "RUN_ACQUISITION_PATH"]);

const ExecuteActionSchema = z.object({
  actionId: ActionIdSchema,
  dealId: z.string().uuid(),
  inputData: z.record(z.string(), z.unknown()).optional(),
});

const TEMPLATE_BY_ACTION: Record<z.infer<typeof ActionIdSchema>, WorkflowTemplateKey> = {
  SCREEN_PARCEL: "QUICK_SCREEN",
  RUN_ACQUISITION_PATH: "ACQUISITION_PATH",
};

function summarizeExecution(output: Record<string, unknown>): string {
  const decision = typeof output.decision === "string" ? output.decision : null;
  const verdict = typeof output.verdict === "string" ? output.verdict : null;
  const score = typeof output.score === "number" ? output.score : null;
  const fitScore = typeof output.fitScore === "number" ? output.fitScore : null;
  const gatePass = typeof output.gatePass === "boolean" ? output.gatePass : null;

  if (decision) {
    return `Decision: ${decision}${fitScore !== null ? `, fit score ${fitScore}` : ""}${gatePass !== null ? `, gate ${gatePass ? "passed" : "failed"}` : ""}.`;
  }

  if (verdict) {
    return `Verdict: ${verdict}${score !== null ? `, score ${score}` : ""}.`;
  }

  return "Workflow completed. Review step outputs for details.";
}

export async function POST(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: z.infer<typeof ExecuteActionSchema>;
  try {
    payload = ExecuteActionSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid payload", issues: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const execution = await runWorkflowSync({
      orgId: auth.orgId,
      dealId: payload.dealId,
      templateKey: TEMPLATE_BY_ACTION[payload.actionId],
      startedBy: auth.userId,
      inputData: {
        ...(payload.inputData ?? {}),
        actionId: payload.actionId,
      },
    });

    const summary =
      execution.status === "completed"
        ? summarizeExecution(execution.output)
        : execution.error ?? "Workflow did not complete.";

    return NextResponse.json(
      {
        action: {
          id: payload.actionId,
          templateKey: execution.templateKey,
        },
        execution,
        summary,
      },
      { status: execution.status === "completed" ? 200 : 500 },
    );
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.actions.execute", method: "POST" },
      extra: { actionId: payload.actionId },
    });
    const message = error instanceof Error ? error.message : "Failed to execute action";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
