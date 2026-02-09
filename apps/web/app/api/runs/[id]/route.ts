import { NextResponse } from "next/server";

// Legacy route stub - old dashboard runs table no longer exists.
export async function GET() {
  return NextResponse.json({ error: "Run not found" }, { status: 404 });
}

export async function PUT() {
  return NextResponse.json({ error: "Legacy runs API is deprecated" }, { status: 410 });
}
