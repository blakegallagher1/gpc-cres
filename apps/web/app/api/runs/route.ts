import { NextResponse } from "next/server";

// Legacy route stub - old dashboard runs table no longer exists.
export async function GET() {
  return NextResponse.json({ runs: [] });
}

export async function POST() {
  return NextResponse.json(
    { error: "Legacy runs API is deprecated" },
    { status: 410 }
  );
}
