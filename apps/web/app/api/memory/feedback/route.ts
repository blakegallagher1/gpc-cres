import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";

const FeedbackInputSchema = z.object({
  requestId: z.string(),
  memoryId: z.string(),
  positive: z.boolean(),
});

export async function POST(req: NextRequest) {
  const auth = await resolveAuth(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const validated = FeedbackInputSchema.parse(body);

    const feedback = await prisma.memoryFeedback.create({
      data: {
        orgId: auth.orgId,
        requestId: validated.requestId,
        memoryId: validated.memoryId,
        positive: validated.positive,
        userId: auth.userId,
      },
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
