import { NextResponse } from "next/server";

// Legacy route stub - old dashboard workflows table no longer exists.
export async function GET() {
  return NextResponse.json({ workflows: [] });
}

export async function POST() {
  return NextResponse.json(
    { error: "Legacy workflows API is deprecated" },
    { status: 410 }
  );
}
