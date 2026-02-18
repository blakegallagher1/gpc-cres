import { NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { respondToProactiveAction } from "@/lib/services/proactiveAction.service";

const ResponseSchema = z.object({
  response: z.enum(["APPROVE", "REJECT", "MODIFY"]),
  note: z.string().max(500).optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = ResponseSchema.parse(await request.json());
    const result = await respondToProactiveAction({
      orgId: auth.orgId,
      userId: auth.userId,
      actionId: id,
      response: body.response,
      note: body.note,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "Action not found") {
      return NextResponse.json({ error: "Action not found" }, { status: 404 });
    }
    console.error("[proactive.actions.respond]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
