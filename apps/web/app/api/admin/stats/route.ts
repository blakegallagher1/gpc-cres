import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { orgId } = auth;

  const tab = request.nextUrl.searchParams.get("tab") ?? "overview";
  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") ?? "25", 10)));
  const search = request.nextUrl.searchParams.get("search") ?? "";
  const contentType = request.nextUrl.searchParams.get("contentType") ?? "";
  const offset = (page - 1) * limit;

  const result: Record<string, unknown> = {};

  try {

  // -- Overview (always returned as lightweight summary) --
  if (tab === "overview" || tab === "all") {
    const now = new Date();
    const day1Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const day7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      knowledgeCount,
      verifiedCount,
      entityCount,
      runs24h,
      recentActivity,
      knowledgeByType,
      trajectoryLogCount,
      episodicEntryCount,
      proceduralSkillCount,
      proceduralSkillEpisodeCount,
      promotionGroups,
    ] =
      await Promise.all([
        prisma.$queryRawUnsafe<[{ count: bigint }]>(
          `SELECT count(*) FROM knowledge_embeddings WHERE org_id = $1::uuid`,
          orgId
        ).then((r) => Number(r[0]?.count ?? 0)),

        prisma.memoryVerified.count({ where: { orgId } }),

        prisma.internalEntity.count({ where: { orgId } }),

        prisma.run.count({ where: { orgId, startedAt: { gte: day1Ago } } }),

        prisma.memoryEventLog.findMany({
          where: { orgId, timestamp: { gte: day7Ago } },
          orderBy: { timestamp: "desc" },
          take: 20,
          select: { id: true, sourceType: true, factType: true, timestamp: true },
        }),

        prisma.$queryRawUnsafe<Array<{ content_type: string; count: bigint }>>(
          `SELECT content_type, count(*) FROM knowledge_embeddings WHERE org_id = $1::uuid GROUP BY content_type ORDER BY count(*) DESC`,
          orgId
        ).then((rows) => rows.map((r) => ({ contentType: r.content_type, count: Number(r.count) }))),
        prisma.trajectoryLog.count({ where: { orgId } }),
        prisma.episodicEntry.count({ where: { orgId } }),
        prisma.proceduralSkill.count({ where: { orgId } }),
        prisma.proceduralSkillEpisode.count({ where: { orgId } }),
        prisma.run.groupBy({
          by: ["memoryPromotionStatus"],
          where: { orgId },
          _count: true,
        }),
      ]);

    const promotionBreakdown = promotionGroups.reduce<Record<string, number>>((acc, group) => {
      acc[group.memoryPromotionStatus ?? "unset"] = group._count;
      return acc;
    }, {});

    result.overview = {
      knowledgeCount,
      verifiedCount,
      entityCount,
      trajectoryLogCount,
      episodicEntryCount,
      proceduralSkillCount,
      proceduralSkillEpisodeCount,
      runs24h,
      promotionBreakdown,
      recentActivity: recentActivity.map((e) => ({
        type: e.sourceType,
        summary: `${e.sourceType}: ${e.factType ?? "unknown"}`,
        createdAt: e.timestamp.toISOString(),
      })),
      knowledgeByType,
    };
  }

  // -- Knowledge tab --
  if (tab === "knowledge") {
    const conditions: string[] = [`org_id = $1::uuid`];
    const countConditions: string[] = [`org_id = $1::uuid`];
    const params: unknown[] = [orgId, limit, offset];
    const countParams: unknown[] = [orgId];
    let paramIndex = 4; // $1=orgId, $2=limit, $3=offset, next=$4
    let countParamIndex = 2;

    if (search) {
      conditions.push(`content_text ILIKE $${paramIndex}`);
      params.push(`%${search}%`);
      paramIndex++;
      countConditions.push(`content_text ILIKE $${countParamIndex}`);
      countParams.push(`%${search}%`);
      countParamIndex++;
    }
    if (contentType) {
      conditions.push(`content_type = $${paramIndex}`);
      params.push(contentType);
      countConditions.push(`content_type = $${countParamIndex}`);
      countParams.push(contentType);
    }

    const whereClause = conditions.join(" AND ");
    const countWhereClause = countConditions.join(" AND ");

    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string;
      content_type: string;
      source_id: string;
      content_text: string;
      metadata: Record<string, unknown>;
      created_at: Date;
    }>>(
      `SELECT id, content_type, source_id, content_text, metadata, created_at
       FROM knowledge_embeddings
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      ...params
    );

    const totalCount = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT count(*) FROM knowledge_embeddings WHERE ${countWhereClause}`,
      ...countParams
    ).then((r) => Number(r[0]?.count ?? 0));

    const contentTypes = await prisma.$queryRawUnsafe<Array<{ content_type: string }>>(
      `SELECT DISTINCT content_type FROM knowledge_embeddings WHERE org_id = $1::uuid ORDER BY content_type`,
      orgId
    ).then((rows) => rows.map((r) => r.content_type));

    result.knowledge = {
      rows: rows.map((r) => ({
        id: r.id,
        contentType: r.content_type,
        sourceId: r.source_id,
        contentText: r.content_text,
        metadata: r.metadata,
        createdAt: r.created_at,
      })),
      total: totalCount,
      page,
      contentTypes,
    };
  }

  // -- Memory tab --
  if (tab === "memory") {
    const subTab = request.nextUrl.searchParams.get("subTab") ?? "facts";

    if (subTab === "facts") {
      const [rows, total] = await Promise.all([
        prisma.memoryVerified.findMany({
          where: { orgId },
          orderBy: { createdAt: "desc" },
          skip: offset,
          take: limit,
          include: {
            entity: { select: { id: true, canonicalAddress: true, type: true } },
          },
        }),
        prisma.memoryVerified.count({ where: { orgId } }),
      ]);

      result.memory = {
        subTab: "facts",
        rows: rows.map((r) => ({
          id: r.id,
          entityId: r.entityId,
          entityAddress: r.entity?.canonicalAddress ?? "Unknown",
          entityType: r.entity?.type ?? "property",
          factType: r.factType,
          sourceType: r.sourceType,
          economicWeight: r.economicWeight,
          volatilityClass: r.volatilityClass,
          payloadJson: r.payloadJson,
          tier: r.tier,
          createdAt: r.createdAt,
        })),
        total,
        page,
      };
    } else {
      const [rows, total] = await Promise.all([
        prisma.internalEntity.findMany({
          where: { orgId },
          orderBy: { createdAt: "desc" },
          skip: offset,
          take: limit,
          include: { _count: { select: { verifiedMemories: true } } },
        }),
        prisma.internalEntity.count({ where: { orgId } }),
      ]);

      result.memory = {
        subTab: "entities",
        rows: rows.map((r) => ({
          id: r.id,
          canonicalAddress: r.canonicalAddress,
          parcelId: r.parcelId,
          type: r.type,
          factsCount: r._count.verifiedMemories,
          createdAt: r.createdAt,
        })),
        total,
        page,
      };
    }
  }

  // -- Agents tab --
  if (tab === "agents") {
    const now = new Date();
    const day1Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const day7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [runs, total, stats, dailyByRunType, learningCounts] = await Promise.all([
      prisma.run.findMany({
        where: { orgId },
        orderBy: { startedAt: "desc" },
        skip: offset,
        take: limit,
        select: {
          id: true,
          runType: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          error: true,
          dealId: true,
          memoryPromotionStatus: true,
          memoryPromotedAt: true,
          memoryPromotionError: true,
        },
      }),
      prisma.run.count({ where: { orgId } }),
      prisma.run.aggregate({
        where: { orgId, startedAt: { gte: day1Ago } },
        _count: true,
      }).then(async (agg) => {
        const succeeded = await prisma.run.count({
          where: { orgId, startedAt: { gte: day1Ago }, status: "succeeded" },
        });
        return {
          total24h: agg._count,
          successRate: agg._count > 0 ? Math.round((succeeded / agg._count) * 100) : 0,
        };
      }),
      prisma.run.groupBy({
        by: ["runType"],
        where: { orgId, startedAt: { gte: day7Ago } },
        _count: true,
      }).then((groups) => groups.map((g) => ({
        runType: g.runType,
        count: g._count,
      }))),
      Promise.all([
        prisma.trajectoryLog.count({ where: { orgId } }),
        prisma.episodicEntry.count({ where: { orgId } }),
        prisma.proceduralSkill.count({ where: { orgId } }),
      ]).then(([trajectoryLogs, episodicEntries, proceduralSkills]) => ({
        trajectoryLogs,
        episodicEntries,
        proceduralSkills,
      })),
    ]);

    result.agents = {
      runs: runs.map((r) => ({
        id: r.id,
        runType: r.runType,
        status: r.status,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        durationMs: r.finishedAt && r.startedAt
          ? r.finishedAt.getTime() - r.startedAt.getTime()
          : null,
        error: r.error,
        dealId: r.dealId,
        memoryPromotionStatus: r.memoryPromotionStatus,
        memoryPromotedAt: r.memoryPromotedAt,
        memoryPromotionError: r.memoryPromotionError,
      })),
      total,
      page,
      stats,
      dailyByRunType,
      learningCounts,
    };
  }

  // -- System tab --
  if (tab === "system") {
    const tableCounts = await Promise.all([
      prisma.run.count({ where: { orgId } }).then((c) => ["runs", c] as const),
      prisma.trajectoryLog.count({ where: { orgId } }).then((c) => ["trajectoryLogs", c] as const),
      prisma.episodicEntry.count({ where: { orgId } }).then((c) => ["episodicEntries", c] as const),
      prisma.proceduralSkill.count({ where: { orgId } }).then((c) => ["proceduralSkills", c] as const),
      prisma.proceduralSkillEpisode.count({ where: { orgId } }).then((c) => ["proceduralSkillEpisodes", c] as const),
      prisma.memoryVerified.count({ where: { orgId } }).then((c) => ["memoryVerified", c] as const),
      prisma.internalEntity.count({ where: { orgId } }).then((c) => ["internalEntities", c] as const),
      prisma.deal.count({ where: { orgId } }).then((c) => ["deals", c] as const),
      prisma.conversation.count({ where: { orgId } }).then((c) => ["conversations", c] as const),
      prisma.$queryRawUnsafe<[{ count: bigint }]>(
        `SELECT count(*) FROM knowledge_embeddings WHERE org_id = $1::uuid`,
        orgId
      ).then((r) => ["knowledgeEmbeddings", Number(r[0]?.count ?? 0)] as const),
    ]).then((pairs) => Object.fromEntries(pairs));

    result.system = { tableCounts };
  }

  return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[admin/stats] tab=%s error:", tab, message, stack);
    return NextResponse.json(
      { error: "Internal server error", detail: message, tab },
      { status: 500 }
    );
  }
}
