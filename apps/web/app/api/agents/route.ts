import { NextResponse } from "next/server";

// Legacy route stub - old dashboard agents table no longer exists.
// The new Entitlement OS uses the @openai/agents SDK agents defined in packages/openai.
export async function GET() {
  return NextResponse.json({ agents: [] });
}

export async function POST() {
  return NextResponse.json(
    { error: "Legacy agents API is deprecated. Use the chat interface." },
    { status: 410 }
  );
}
