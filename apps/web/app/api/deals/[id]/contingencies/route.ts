import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";

import { createContingency, listContingencies } from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const paramsSchema = z.object({ id: z.string().uuid() });

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

const createSchema = z.object({
  category: categorySchema,
  title: z.string().min(1).max(240),
  description: z.string().max(10_000).nullable().optional(),
  deadline: z.string().nullable().optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
  noticeDaysBeforeDeadline: z.number().int().min(0).max(365).optional(),
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
    const contingencies = await listContingencies(auth.orgId, parsed.data.id);
    return NextResponse.json({ contingencies });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals.contingencies", method: "GET" },
    });
    const message = error instanceof Error ? error.message : "Failed to load contingencies";
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
        { error: "Invalid contingency payload", issues: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const contingency = await createContingency({
      orgId: auth.orgId,
      dealId: parsed.data.id,
      category: payload.category,
      title: payload.title,
      description: payload.description ?? null,
      deadline: payload.deadline ?? null,
      ownerUserId: payload.ownerUserId ?? null,
      noticeDaysBeforeDeadline: payload.noticeDaysBeforeDeadline,
    });
    return NextResponse.json({ contingency }, { status: 201 });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals.contingencies", method: "POST" },
    });
    const message = error instanceof Error ? error.message : "Failed to create contingency";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
