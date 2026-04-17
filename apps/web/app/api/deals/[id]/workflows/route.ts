import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";
import {
  listDealWorkflowExecutions,
  runWorkflowSync,
} from "@gpc/server/workflows/workflow-orchestrator.service";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const paramsSchema = z.object({ id: z.string().uuid() });

const postSchema = z.object({
  templateKey: z.enum(["QUICK_SCREEN", "ACQUISITION_PATH"]),
  inputData: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid deal id" }, { status: 400 });
  }

  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Math.min(100, Math.max(1, Number.parseInt(limitRaw, 10))) : 25;

  try {
    const executions = await listDealWorkflowExecutions(auth.orgId, parsed.data.id, limit);
    return NextResponse.json({ executions });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals.workflows", method: "GET" },
    });
    return NextResponse.json({ error: "Failed to load executions" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid deal id" }, { status: 400 });
  }

  let payload: z.infer<typeof postSchema>;
  try {
    payload = postSchema.parse(await request.json());
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
      dealId: parsed.data.id,
      templateKey: payload.templateKey,
      startedBy: auth.userId,
      inputData: payload.inputData,
    });
    const status = execution.status === "completed" ? 200 : 500;
    return NextResponse.json({ execution }, { status });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals.workflows", method: "POST" },
    });
    const message = error instanceof Error ? error.message : "Failed to execute workflow";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
