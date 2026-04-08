import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { authorizeApiRoute } from "@/lib/auth/authorizeApiRoute";
import { createMemoryFeedback } from "@gpc/server/services/memory-feedback.service";
import * as Sentry from "@sentry/nextjs";

const FeedbackInputSchema = z.object({
  requestId: z.string(),
  memoryId: z.string(),
  positive: z.boolean(),
});

export async function POST(req: NextRequest) {
  const authorization = await authorizeApiRoute(req, req.nextUrl.pathname);
  if (!authorization.ok || !authorization.auth) {
    return authorization.ok
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : authorization.response;
  }
  const auth = authorization.auth;

  try {
    const body = await req.json();
    const validated = FeedbackInputSchema.parse(body);

    const feedback = await createMemoryFeedback({
      orgId: auth.orgId,
      requestId: validated.requestId,
      memoryId: validated.memoryId,
      positive: validated.positive,
      userId: auth.userId,
    });

    return NextResponse.json(feedback, { status: 201 });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "api.memory.feedback", method: "POST" },
    });
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.flatten().fieldErrors },
        { status: 400 },
      );
    }
    console.error("[memory/feedback]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
