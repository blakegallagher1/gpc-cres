import { NextRequest, NextResponse } from "next/server";
import { listTemplates } from "@gpc/server/workflows/workflow-orchestrator.service";
import { resolveAuth } from "@/lib/auth/resolveAuth";

export async function GET(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ templates: listTemplates() });
}
