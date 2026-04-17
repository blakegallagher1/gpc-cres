import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";

import { deleteContingency, updateContingency } from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const paramsSchema = z.object({
  id: z.string().uuid(),
  contingencyId: z.string().uuid(),
});

const categorySchema = z.enum([
  "title",
  "survey",
  "environmental",
  "appraisal",
  "financing",
  "inspection",
  "hoa",
  "zoning",
  "utilities",
  "other",
]);

const statusSchema = z.enum([
  "open",
  "in_progress",
  "satisfied",
  "waived",
  "failed",
]);

const patchSchema = z
  .object({
    status: statusSchema.optional(),
    deadline: z.string().nullable().optional(),
    ownerUserId: z.string().uuid().nullable().optional(),
    satisfactionNotes: z.string().max(10_000).nullable().optional(),
    noticeDaysBeforeDeadline: z.number().int().min(0).max(365).optional(),
    title: z.string().min(1).max(240).optional(),
    description: z.string().max(10_000).nullable().optional(),
    category: categorySchema.optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one field required",
  });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contingencyId: string }> },
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
      return NextResponse.json(
        { error: "Invalid payload", issues: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const contingency = await updateContingency({
      orgId: auth.orgId,
      dealId: parsed.data.id,
      contingencyId: parsed.data.contingencyId,
      actorUserId: auth.userId,
      patch: payload,
    });
    return NextResponse.json({ contingency });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals.contingencies.contingency", method: "PATCH" },
    });
    const message = error instanceof Error ? error.message : "Failed to update contingency";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contingencyId: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  try {
    await deleteContingency({
      orgId: auth.orgId,
      dealId: parsed.data.id,
      contingencyId: parsed.data.contingencyId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals.contingencies.contingency", method: "DELETE" },
    });
    const message = error instanceof Error ? error.message : "Failed to delete contingency";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
