import { NextResponse } from "next/server";

// Legacy route stub - old dashboard traces table no longer exists.
export async function GET() {
  return NextResponse.json({ traces: [] });
}

export async function POST() {
  return NextResponse.json(
    { error: "Legacy traces API is deprecated" },
    { status: 410 }
  );
}
