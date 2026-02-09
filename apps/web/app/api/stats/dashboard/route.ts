import { NextResponse } from "next/server";

// Legacy route stub - returns zero stats since old dashboard tables no longer exist.
export async function GET() {
  return NextResponse.json({
    stats: {
      totalRuns24h: 0,
      totalRunsChange: 0,
      activeAgents: 0,
      totalAgents: 0,
      avgLatency: 0,
      avgLatencyChange: 0,
      tokenUsage24h: 0,
      tokenUsageChange: 0,
      estimatedCost: 0,
    },
  });
}
