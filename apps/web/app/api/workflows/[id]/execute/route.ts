import { NextResponse } from "next/server";

// Legacy route stub - old dashboard workflow execution no longer exists.
export async function POST() {
  return NextResponse.json(
    { error: "Legacy workflow execution API is deprecated" },
    { status: 410 }
  );
}
