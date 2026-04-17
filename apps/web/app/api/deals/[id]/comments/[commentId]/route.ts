import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";

import { deleteDealComment, updateDealComment } from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const paramsSchema = z.object({
  id: z.string().uuid(),
  commentId: z.string().uuid(),
});

const patchSchema = z.object({
  body: z.string().min(1).max(10_000).optional(),
  pinned: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  let payload: z.infer<typeof patchSchema>;
  try {
    payload = patchSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid payload", issues: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const comment = await updateDealComment({
      orgId: auth.orgId,
      dealId: parsed.data.id,
      commentId: parsed.data.commentId,
      actorUserId: auth.userId,
      body: payload.body,
      pinned: payload.pinned,
    });
    return NextResponse.json({ comment });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals.comments.comment", method: "PATCH" },
    });
    const message = error instanceof Error ? error.message : "Failed to update comment";
    const status = message.includes("not found")
      ? 404
      : message.includes("Only the author")
        ? 403
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  try {
    await deleteDealComment({
      orgId: auth.orgId,
      dealId: parsed.data.id,
      commentId: parsed.data.commentId,
      actorUserId: auth.userId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals.comments.comment", method: "DELETE" },
    });
    const message = error instanceof Error ? error.message : "Failed to delete comment";
    const status = message.includes("not found")
      ? 404
      : message.includes("Only the author")
        ? 403
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
