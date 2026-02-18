import { NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { listUserPreferences } from "@/lib/services/preferenceService";

export async function GET() {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const preferences = await listUserPreferences(auth.orgId, auth.userId);
    return NextResponse.json({ preferences });
  } catch (error) {
    console.error("[preferences.get]", error);
    return NextResponse.json(
      { error: "Failed to fetch preferences" },
      { status: 500 },
    );
  }
}
