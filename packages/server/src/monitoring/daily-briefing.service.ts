import { prisma } from "@entitlement-os/db";
import { createTextResponse } from "@entitlement-os/openai";

export interface BriefingData {
  generatedAt: string;
  summary: string;
  sections: {
    newActivity: { label: string; items: string[] };
    needsAttention: {
      label: string;
      items: Array<{ title: string; dealId: string; dealName: string; reason: string }>;
    };
    automationActivity: {
      label: string;
      items: Array<{ title: string; status: string; dealName: string | null; createdAt: string }>;
    };
    pipelineSnapshot: { label: string; stages: Array<{ status: string; count: number }> };
  };
}

export class DailyBriefingService {
  async generate(orgId: string): Promise<BriefingData> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      recentDeals,
      recentRuns,
      overdueTasks,
      stalledDeals,
      pipelineCounts,
      recentNotifications,
    ] = await Promise.all([
      prisma.deal.findMany({
        where: { orgId, createdAt: { gte: since } },
        select: { id: true, name: true, sku: true, status: true, source: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.run.findMany({
        where: { orgId, startedAt: { gte: since } },
        select: {
          id: true,
          runType: true,
          status: true,
          deal: { select: { name: true } },
          startedAt: true,
        },
        orderBy: { startedAt: "desc" },
        take: 20,
      }),
      prisma.task.findMany({
        where: {
          orgId,
          status: { in: ["TODO", "IN_PROGRESS"] },
          dueAt: { lt: new Date() },
        },
        select: {
          id: true,
          title: true,
          dealId: true,
          deal: { select: { name: true } },
          dueAt: true,
        },
        orderBy: { dueAt: "asc" },
        take: 10,
      }),
      prisma.deal.findMany({
        where: {
          orgId,
          status: { notIn: ["KILLED", "EXITED"] },
          updatedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        select: { id: true, name: true, status: true, updatedAt: true },
        orderBy: { updatedAt: "asc" },
        take: 5,
      }),
      prisma.deal.groupBy({
        by: ["status"],
        where: { orgId, status: { notIn: ["KILLED", "EXITED"] } },
        _count: true,
      }),
      prisma.notification.findMany({
        where: { orgId, createdAt: { gte: since } },
        select: { title: true, type: true, createdAt: true, deal: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    const newActivity: string[] = [];
    if (recentDeals.length > 0) {
      newActivity.push(`${recentDeals.length} new deal(s) created`);
      for (const deal of recentDeals.slice(0, 5)) {
        const source = deal.source ? ` (${deal.source})` : "";
        newActivity.push(`  - ${deal.name} [${deal.sku}]${source}`);
      }
    }
    const successfulRuns = recentRuns.filter((run) => run.status === "succeeded");
    const failedRuns = recentRuns.filter((run) => run.status === "failed");
    if (successfulRuns.length > 0) {
      newActivity.push(`${successfulRuns.length} automation run(s) completed successfully`);
    }
    if (failedRuns.length > 0) {
      newActivity.push(`${failedRuns.length} automation run(s) failed`);
    }

    const needsAttention: BriefingData["sections"]["needsAttention"]["items"] = [];
    for (const task of overdueTasks) {
      needsAttention.push({
        title: task.title,
        dealId: task.dealId,
        dealName: task.deal.name,
        reason: `Overdue since ${task.dueAt?.toLocaleDateString() ?? "unknown"}`,
      });
    }
    for (const deal of stalledDeals) {
      needsAttention.push({
        title: `${deal.name} - stalled at ${deal.status}`,
        dealId: deal.id,
        dealName: deal.name,
        reason: `No activity since ${deal.updatedAt.toLocaleDateString()}`,
      });
    }

    const automationActivity: BriefingData["sections"]["automationActivity"]["items"] = recentRuns
      .slice(0, 10)
      .map((run) => ({
        title: `${run.runType} run`,
        status: run.status,
        dealName: run.deal?.name ?? null,
        createdAt: run.startedAt.toISOString(),
      }));

    const pipelineSnapshot: BriefingData["sections"]["pipelineSnapshot"]["stages"] =
      pipelineCounts.map((group) => ({
        status: group.status,
        count: group._count,
      }));

    let summary = "";
    try {
      summary = await this.synthesizeBriefing({
        newDeals: recentDeals.length,
        successfulRuns: successfulRuns.length,
        failedRuns: failedRuns.length,
        overdueItems: overdueTasks.length,
        stalledDeals: stalledDeals.length,
        totalActive: pipelineCounts.reduce((accumulator, group) => accumulator + group._count, 0),
        recentNotifications: recentNotifications.map((notification) => notification.title),
      });
    } catch {
      summary = this.buildFallbackSummary({
        newDeals: recentDeals.length,
        successfulRuns: successfulRuns.length,
        failedRuns: failedRuns.length,
        overdueItems: overdueTasks.length,
        stalledDeals: stalledDeals.length,
        totalActive: pipelineCounts.reduce((accumulator, group) => accumulator + group._count, 0),
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      summary,
      sections: {
        newActivity: { label: "Last 24 Hours", items: newActivity },
        needsAttention: { label: "Needs Attention", items: needsAttention },
        automationActivity: { label: "Recent Automation", items: automationActivity },
        pipelineSnapshot: { label: "Pipeline Snapshot", stages: pipelineSnapshot },
      },
    };
  }

  private async synthesizeBriefing(context: {
    newDeals: number;
    successfulRuns: number;
    failedRuns: number;
    overdueItems: number;
    stalledDeals: number;
    totalActive: number;
    recentNotifications: string[];
  }): Promise<string> {
    try {
      const { text } = await createTextResponse({
        model: "gpt-5.4-mini",
        maxOutputTokens: 300,
        temperature: undefined,
        systemPrompt:
          "You are a concise CRE operations briefing assistant for Gallagher Property Company. Write a 2-4 sentence morning briefing highlighting the most important items. Be direct and actionable. No greetings or sign-offs.",
        userPrompt: `Daily briefing context:
- ${context.newDeals} new deal(s) created in last 24h
- ${context.successfulRuns} successful automation runs, ${context.failedRuns} failed
- ${context.overdueItems} overdue task(s) need attention
- ${context.stalledDeals} deal(s) stalled >7 days
- ${context.totalActive} total active deals in pipeline
- Recent notifications: ${context.recentNotifications.slice(0, 5).join("; ") || "None"}

Write a brief morning summary with the top 1-2 action items.`,
      });
      return text || this.buildFallbackSummary(context);
    } catch {
      return this.buildFallbackSummary(context);
    }
  }

  private buildFallbackSummary(context: {
    newDeals: number;
    successfulRuns: number;
    failedRuns: number;
    overdueItems: number;
    stalledDeals: number;
    totalActive: number;
  }): string {
    const parts: string[] = [];
    parts.push(`${context.totalActive} active deal(s) in pipeline.`);
    if (context.newDeals > 0) parts.push(`${context.newDeals} new deal(s) in the last 24 hours.`);
    if (context.failedRuns > 0) parts.push(`${context.failedRuns} automation run(s) failed and need review.`);
    if (context.overdueItems > 0) parts.push(`${context.overdueItems} overdue task(s) need attention.`);
    if (context.stalledDeals > 0) parts.push(`${context.stalledDeals} deal(s) stalled for over 7 days.`);
    return parts.join(" ");
  }
}
