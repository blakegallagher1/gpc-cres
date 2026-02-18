import { NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  createProactiveTrigger,
  listProactiveTriggers,
} from "@/lib/services/proactiveTrigger.service";

const TriggerSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  triggerType: z.enum(["SCHEDULED", "EVENT", "WEBHOOK", "ANOMALY"]),
  triggerConfig: z.record(z.string(), z.unknown()),
  conditions: z
    .array(
      z.object({
        field: z.string().min(1),
        op: z.enum(["eq", "gt", "gte", "lt", "lte", "in", "contains"]),
        value: z.unknown(),
      }),
    )
    .default([]),
  actionType: z.enum(["NOTIFY", "RUN_WORKFLOW", "CREATE_TASK", "AUTO_TRIAGE"]),
  actionConfig: z.record(z.string(), z.unknown()).default({}),
  requireApproval: z.boolean().default(true),
  maxRunsPerDay: z.number().int().min(1).max(500).default(10),
  maxAutoCost: z.number().min(0).max(1000).default(5),
  targetUsers: z.array(z.string().uuid()).optional(),
});

export async function GET() {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const triggers = await listProactiveTriggers(auth.orgId);
    return NextResponse.json({ triggers });
  } catch (error) {
    console.error("[proactive.triggers.get]", error);
    return NextResponse.json(
      { error: "Failed to fetch triggers" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = TriggerSchema.parse(await request.json());
    const trigger = await createProactiveTrigger(auth.orgId, auth.userId, {
      name: body.name,
      description: body.description,
      triggerType: body.triggerType,
      triggerConfig: body.triggerConfig,
      conditions: body.conditions,
      actionType: body.actionType,
      actionConfig: body.actionConfig,
      requireApproval: body.requireApproval,
      maxRunsPerDay: body.maxRunsPerDay,
      maxAutoCost: body.maxAutoCost,
      targetUsers: body.targetUsers,
    });

    return NextResponse.json({ trigger });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    console.error("[proactive.triggers.post]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
