import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";
import {
  acknowledgePortfolioAlert,
  snoozePortfolioAlert,
} from "@gpc/server/automation/portfolio-watcher.service";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const paramsSchema = z.object({ id: z.string().uuid() });

const patchSchema = z.object({
  action: z.enum(["acknowledge", "snooze"]),
  snoozeUntil: z.string().datetime().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid alert id" }, { status: 400 });
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
    if (payload.action === "acknowledge") {
      await acknowledgePortfolioAlert(auth.orgId, parsed.data.id, auth.userId);
    } else {
      if (!payload.snoozeUntil) {
        return NextResponse.json(
          { error: "snoozeUntil required for snooze action" },
          { status: 400 },
        );
      }
      await snoozePortfolioAlert(auth.orgId, parsed.data.id, payload.snoozeUntil);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.portfolio.alerts.alert", method: "PATCH" },
    });
    const message = error instanceof Error ? error.message : "Failed to update alert";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
