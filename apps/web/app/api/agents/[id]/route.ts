import { NextResponse } from "next/server";

// Legacy route stub - old dashboard agents table no longer exists.
export async function GET() {
  return NextResponse.json({ error: "Agent not found" }, { status: 404 });
}

export async function PUT() {
  return NextResponse.json({ error: "Legacy agents API is deprecated" }, { status: 410 });
}

export async function DELETE() {
  return NextResponse.json({ error: "Legacy agents API is deprecated" }, { status: 410 });
}
