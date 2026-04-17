import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";

import {
  createDealComment,
  listDealComments,
} from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const paramsSchema = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  body: z.string().min(1).max(10_000),
  parentCommentId: z.string().uuid().nullable().optional(),
  mentions: z.array(z.string().uuid()).max(50).optional(),
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

  try {
    const comments = await listDealComments(auth.orgId, parsed.data.id);
    return NextResponse.json({ comments });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals.comments", method: "GET" },
    });
    const message = error instanceof Error ? error.message : "Failed to load comments";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
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

  let payload: z.infer<typeof createSchema>;
  try {
    payload = createSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid comment payload", issues: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const comment = await createDealComment({
      orgId: auth.orgId,
      dealId: parsed.data.id,
      authorUserId: auth.userId,
      body: payload.body,
      parentCommentId: payload.parentCommentId ?? null,
      mentions: payload.mentions ?? [],
    });
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals.comments", method: "POST" },
    });
    const message = error instanceof Error ? error.message : "Failed to create comment";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
