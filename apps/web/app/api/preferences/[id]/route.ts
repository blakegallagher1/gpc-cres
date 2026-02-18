import { NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { updateUserPreference } from "@/lib/services/preferenceService";

const PreferencePatchSchema = z
  .object({
    confidence: z.number().min(0).max(1).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (payload) =>
      typeof payload.confidence === "number" || typeof payload.isActive === "boolean",
    { message: "At least one of confidence or isActive is required." },
  );

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = PreferencePatchSchema.parse(await request.json());
    const preference = await updateUserPreference({
      orgId: auth.orgId,
      userId: auth.userId,
      preferenceId: id,
      confidence: body.confidence,
      isActive: body.isActive,
    });

    return NextResponse.json({ preference });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "Preference not found") {
      return NextResponse.json({ error: "Preference not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "Preference storage unavailable") {
      return NextResponse.json(
        { error: "Preference storage is temporarily unavailable" },
        { status: 503 },
      );
    }
    console.error("[preferences.patch]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
