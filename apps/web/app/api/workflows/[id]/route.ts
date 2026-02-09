import { NextResponse } from "next/server";

// Legacy route stub - old dashboard workflows table no longer exists.
export async function GET() {
  return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
}

export async function PUT() {
  return NextResponse.json({ error: "Legacy workflows API is deprecated" }, { status: 410 });
}

export async function DELETE() {
  return NextResponse.json({ error: "Legacy workflows API is deprecated" }, { status: 410 });
}
