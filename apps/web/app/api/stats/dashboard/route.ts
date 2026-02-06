import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase";

const MS_IN_DAY = 24 * 60 * 60 * 1000;

function percentChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// GET /api/stats/dashboard
export async function GET() {
  try {
    const now = new Date();
    const startCurrent = new Date(now.getTime() - MS_IN_DAY);
    const startPrevious = new Date(now.getTime() - MS_IN_DAY * 2);

    const [agentsRes, currentRunsRes, previousRunsRes] = await Promise.all([
      supabaseAdmin.from("agents").select("id,status"),
      supabaseAdmin
        .from("runs")
        .select("id,tokens_used,duration_ms,cost")
        .gte("started_at", startCurrent.toISOString())
        .lt("started_at", now.toISOString()),
      supabaseAdmin
        .from("runs")
        .select("id,tokens_used,duration_ms,cost")
        .gte("started_at", startPrevious.toISOString())
        .lt("started_at", startCurrent.toISOString()),
    ]);

    if (agentsRes.error) throw agentsRes.error;
    if (currentRunsRes.error) throw currentRunsRes.error;
    if (previousRunsRes.error) throw previousRunsRes.error;

    const agents = agentsRes.data ?? [];
    const currentRuns = currentRunsRes.data ?? [];
    const previousRuns = previousRunsRes.data ?? [];

    const totalAgents = agents.length;
    const activeAgents = agents.filter((agent) => agent.status === "active").length;

    const totalRuns24h = currentRuns.length;
    const previousRuns24h = previousRuns.length;

    const tokenUsage24h = currentRuns.reduce(
      (sum, run) => sum + (run.tokens_used ?? 0),
      0
    );
    const previousTokenUsage24h = previousRuns.reduce(
      (sum, run) => sum + (run.tokens_used ?? 0),
      0
    );

    const avgLatencyMs =
      currentRuns.length > 0
        ? Math.round(
            currentRuns.reduce((sum, run) => sum + (run.duration_ms ?? 0), 0) /
              currentRuns.length
          )
        : 0;
    const prevAvgLatencyMs =
      previousRuns.length > 0
        ? Math.round(
            previousRuns.reduce((sum, run) => sum + (run.duration_ms ?? 0), 0) /
              previousRuns.length
          )
        : 0;

    const estimatedCost = currentRuns.reduce(
      (sum, run) => sum + (run.cost ?? 0),
      0
    );

    const stats = {
      totalRuns24h,
      totalRunsChange: percentChange(totalRuns24h, previousRuns24h),
      activeAgents,
      totalAgents,
      avgLatency: Number((avgLatencyMs / 1000).toFixed(2)),
      avgLatencyChange: percentChange(avgLatencyMs, prevAvgLatencyMs),
      tokenUsage24h,
      tokenUsageChange: percentChange(tokenUsage24h, previousTokenUsage24h),
      estimatedCost: Number(estimatedCost.toFixed(2)),
    };

    return NextResponse.json({ stats });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard stats" },
      { status: 500 }
    );
  }
}
