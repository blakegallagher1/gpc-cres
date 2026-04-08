import { NextRequest, NextResponse } from "next/server";
import { getAgentLearningStats } from "@gpc/server";

import { resolveAuth } from "@/lib/auth/resolveAuth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = auth;
  return NextResponse.json(await getAgentLearningStats(orgId));
}
