import { NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";

type Aggregated = {
  toolName: string;
  totalCalls: number;
  successCount: number;
  fallbackCount: number;
  totalLatency: number;
  lastFailure: string | null;
};

export async function GET() {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const metrics = await prisma.toolExecutionMetric.findMany({
      where: {
        createdAt: { gte: since },
        OR: [{ orgId: auth.orgId }, { orgId: null }],
      },
      orderBy: { createdAt: "desc" },
      select: {
        toolName: true,
        status: true,
        latencyMs: true,
        fallbackUsed: true,
        createdAt: true,
      },
    });

    const byTool = new Map<string, Aggregated>();

    for (const metric of metrics) {
      const current =
        byTool.get(metric.toolName) ??
        ({
          toolName: metric.toolName,
          totalCalls: 0,
          successCount: 0,
          fallbackCount: 0,
          totalLatency: 0,
          lastFailure: null,
        } satisfies Aggregated);

      current.totalCalls += 1;
      current.totalLatency += metric.latencyMs;

      if (metric.status !== "FAILED") current.successCount += 1;
      if (metric.fallbackUsed || metric.status === "FALLBACK" || metric.status === "INFERRED") {
        current.fallbackCount += 1;
      }
      if (metric.status === "FAILED" && current.lastFailure === null) {
        current.lastFailure = metric.createdAt.toISOString();
      }

      byTool.set(metric.toolName, current);
    }

    const tools = Array.from(byTool.values()).map((tool) => {
      const successRate = tool.totalCalls > 0 ? (tool.successCount / tool.totalCalls) * 100 : 100;
      const fallbackRate = tool.totalCalls > 0 ? tool.fallbackCount / tool.totalCalls : 0;
      const avgLatency = tool.totalCalls > 0 ? Math.round(tool.totalLatency / tool.totalCalls) : 0;

      let status: "HEALTHY" | "DEGRADED" | "UNHEALTHY" = "HEALTHY";
      if (successRate < 80) status = "UNHEALTHY";
      else if (successRate < 95 || fallbackRate > 0.2) status = "DEGRADED";

      return {
        toolName: tool.toolName,
        totalCalls: tool.totalCalls,
        successRate,
        avgLatency,
        fallbackRate,
        lastFailure: tool.lastFailure,
        status,
      };
    });

    return NextResponse.json({ tools });
  } catch (error) {
    console.error("[tools.health]", error);
    return NextResponse.json(
      { error: "Failed to load tool health metrics" },
      { status: 500 },
    );
  }
}
