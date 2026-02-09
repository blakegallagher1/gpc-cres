import { NextResponse } from "next/server";

// Legacy route stub - old dashboard agent run table no longer exists.
export async function POST() {
  return NextResponse.json(
    { error: "Legacy agent run API is deprecated. Use the chat interface." },
    { status: 410 }
  );
}
