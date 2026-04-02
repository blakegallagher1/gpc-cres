import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { authorizeApiRoute } from "@/lib/auth/authorizeApiRoute";
import { isSchemaDriftError } from "@/lib/api/prismaSchemaFallback";

export const dynamic = "force-dynamic";

const VALID_TABS = ["overview", "knowledge", "memory", "agents", "system", "all"] as const;

type AdminRunRow = {
  id: string;
  runType: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  error: string | null;
  dealId: string | null;
  memoryPromotionStatus: string | null;
  memoryPromotedAt: Date | null;
  memoryPromotionError: string | null;
};

type AdminTabError = {
  message: string;
  detail?: string;
};

type AdminTabErrors = Record<string, AdminTabError>;

type KnowledgeEmbeddingRow = {
  id: string;
  content_type: string;
  source_id: string;
  content_text: string;
  metadata: Record<string, unknown>;
  created_at: Date;
};

type KnowledgeContentTypeRow = {
  content_type: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runTabSafely<T>(tab: string, errors: AdminTabErrors, runner: () => Promise<T>): Promise<T | null> {
  try {
    return await runner();
  } catch (err: unknown) {
    if (!errors[tab]) {
      errors[tab] = {
        message: "Unable to load this section",
        detail: errorMessage(err),
      };
    }
    console.error(`[admin/stats] ${tab} tab error`, err);
    return null;
  }
}

async function countProceduralSkillEpisodes(orgId: string): Promise<number> {
  try {
    return await prisma.proceduralSkillEpisode.count({ where: { orgId } });
  } catch (error: unknown) {
    if (!isSchemaDriftError(error)) {
      throw error;
    }

    console.warn(
      "[admin/stats] procedural_skill_episodes unavailable; returning 0 for stats",
      error instanceof Error ? error.message : String(error),
    );
    return 0;
  }
}

async function getMemoryPromotionGroups(orgId: string) {
  try {
    return await prisma.run.groupBy({
      by: ["memoryPromotionStatus"],
      where: { orgId },
      _count: true,
    });
  } catch (error: unknown) {
    if (!isSchemaDriftError(error)) {
      throw error;
    }

    console.warn(
      "[admin/stats] run memory promotion fields unavailable; omitting promotion breakdown",
      error instanceof Error ? error.message : String(error),
    );
    return [];
  }
}

async function getAgentRuns(orgId: string, offset: number, limit: number): Promise<AdminRunRow[]> {
  try {
    return await prisma.run.findMany({
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
    });
  } catch (error: unknown) {
    if (!isSchemaDriftError(error)) {
      throw error;
    }

    console.warn(
      "[admin/stats] run memory promotion fields unavailable; returning runs without promotion metadata",
      error instanceof Error ? error.message : String(error),
    );

    const runs = await prisma.run.findMany({
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
      },
    });

    return runs.map((run) => ({
      ...run,
      memoryPromotionStatus: null,
      memoryPromotedAt: null,
      memoryPromotionError: null,
    }));
  }
}

function buildSafeCountRunner(orgId: string, model: keyof typeof prisma): (tab: string, errors: AdminTabErrors) => Promise<number> {
  return async (tab: string, errors: AdminTabErrors) => {
    if (model === "run") {
      return (await runTabSafely(tab, errors, () => prisma.run.count({ where: { orgId } }))) ?? 0;
    }
    if (model === "trajectoryLog") {
      return (await runTabSafely(tab, errors, () => prisma.trajectoryLog.count({ where: { orgId } }))) ?? 0;
    }
    if (model === "episodicEntry") {
      return (
        (await runTabSafely(tab, errors, () => prisma.episodicEntry.count({ where: { orgId } }))) ??
        0
      );
    }
    if (model === "proceduralSkill") {
      return (await runTabSafely(tab, errors, () => prisma.proceduralSkill.count({ where: { orgId } }))) ?? 0;
    }
    if (model === "memoryVerified") {
      return (
        (await runTabSafely(tab, errors, () => prisma.memoryVerified.count({ where: { orgId } }))) ??
        0
      );
    }
    if (model === "internalEntity") {
      return (
        (await runTabSafely(tab, errors, () => prisma.internalEntity.count({ where: { orgId } }))) ??
        0
      );
    }
    if (model === "deal") {
      return (await runTabSafely(tab, errors, () => prisma.deal.count({ where: { orgId } }))) ?? 0;
    }
    if (model === "conversation") {
      return (await runTabSafely(tab, errors, () => prisma.conversation.count({ where: { orgId } }))) ?? 0;
    }

    return 0;
  };
}

async function runCountWithFallback(orgId: string, model: keyof typeof prisma, tab: string, errors: AdminTabErrors) {
  return buildSafeCountRunner(orgId, model)(tab, errors);
}

async function safeEpisodeCount(orgId: string, tab: string, errors: AdminTabErrors) {
  return (await runTabSafely(tab, errors, () => countProceduralSkillEpisodes(orgId))) ?? 0;
}

export async function GET(request: NextRequest) {
  const authorization = await authorizeApiRoute(request, request.nextUrl.pathname);
  if (!authorization.ok || !authorization.auth) {
    return authorization.ok
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : authorization.response;
  }
  const auth = authorization.auth;
  const { orgId } = auth;

  const tab = request.nextUrl.searchParams.get("tab") ?? "overview";
  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") ?? "25", 10)));
  const search = request.nextUrl.searchParams.get("search") ?? "";
  const contentType = request.nextUrl.searchParams.get("contentType") ?? "";
  const offset = (page - 1) * limit;

  if (!VALID_TABS.includes(tab as (typeof VALID_TABS)[number])) {
    return NextResponse.json(
      { error: "Invalid tab parameter", detail: `Expected one of: ${VALID_TABS.join(", ")}` },
      { status: 400 },
    );
  }

  const result: Record<string, unknown> = {};
  const errors: AdminTabErrors = {};

  try {
    const shouldLoadOverview = tab === "overview" || tab === "all";
    const shouldLoadKnowledge = tab === "knowledge" || tab === "all";
    const shouldLoadMemory = tab === "memory" || tab === "all";
    const shouldLoadAgents = tab === "agents" || tab === "all";
    const shouldLoadSystem = tab === "system" || tab === "all";

    if (shouldLoadOverview) {
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
      ] = await Promise.all([
        runTabSafely(
          "overview",
          errors,
          () =>
            prisma.$queryRawUnsafe<[{ count: bigint }]>(
              `SELECT count(*) FROM knowledge_embeddings WHERE org_id = $1::uuid`,
              orgId,
            ).then((r) => Number(r[0]?.count ?? 0)),
        ),
        runTabSafely("overview", errors, () => prisma.memoryVerified.count({ where: { orgId } })),
        runTabSafely("overview", errors, () => prisma.internalEntity.count({ where: { orgId } })),
        runTabSafely(
          "overview",
          errors,
          () => prisma.run.count({ where: { orgId, startedAt: { gte: day1Ago } } }),
        ),
        runTabSafely(
          "overview",
          errors,
          async () => {
            const rows = await prisma.memoryEventLog.findMany({
              where: { orgId, timestamp: { gte: day7Ago } },
              orderBy: { timestamp: "desc" },
              take: 20,
              select: { sourceType: true, factType: true, timestamp: true },
            });

            return rows.map((e) => ({
              type: e.sourceType,
              summary: `${e.sourceType}: ${e.factType ?? "unknown"}`,
              createdAt: e.timestamp.toISOString(),
            }));
          },
        ),
        runTabSafely("overview", errors, () =>
          prisma.$queryRawUnsafe<Array<{ content_type: string; count: bigint }>>(
            `SELECT content_type, count(*) FROM knowledge_embeddings WHERE org_id = $1::uuid GROUP BY content_type ORDER BY count(*) DESC`,
            orgId,
          ).then((rows) =>
            rows.map((r) => ({
              contentType: r.content_type,
              count: Number(r.count),
            })),
          ),
        ),
        runCountWithFallback(orgId, "trajectoryLog", "overview", errors),
        runCountWithFallback(orgId, "episodicEntry", "overview", errors),
        runCountWithFallback(orgId, "proceduralSkill", "overview", errors),
        safeEpisodeCount(orgId, "overview", errors),
        runTabSafely("overview", errors, () => getMemoryPromotionGroups(orgId)),
      ]);

      result.overview = {
        knowledgeCount: knowledgeCount ?? 0,
        verifiedCount: verifiedCount ?? 0,
        entityCount: entityCount ?? 0,
        runs24h: runs24h ?? 0,
        trajectoryLogCount: trajectoryLogCount ?? 0,
        episodicEntryCount: episodicEntryCount ?? 0,
        proceduralSkillCount: proceduralSkillCount ?? 0,
        proceduralSkillEpisodeCount: proceduralSkillEpisodeCount ?? 0,
        promotionBreakdown: (promotionGroups ?? []).reduce<Record<string, number>>((acc, group) => {
          acc[group.memoryPromotionStatus ?? "unset"] = group._count;
          return acc;
        }, {}),
        recentActivity: recentActivity ?? [],
        knowledgeByType: knowledgeByType ?? [],
      };
    }

    if (shouldLoadKnowledge) {
      const conditions: string[] = [`org_id = $1::uuid`];
      const countConditions: string[] = [`org_id = $1::uuid`];
      const params: unknown[] = [orgId, limit, offset];
      const countParams: unknown[] = [orgId];
      let paramIndex = 4;
      let countParamIndex = 2;

      if (search) {
        conditions.push(`content_text ILIKE $${paramIndex}`);
        params.push(`%${search}%`);
        paramIndex += 1;
        countConditions.push(`content_text ILIKE $${countParamIndex}`);
        countParams.push(`%${search}%`);
        countParamIndex += 1;
      }
      if (contentType) {
        conditions.push(`content_type = $${paramIndex}`);
        params.push(contentType);
        countConditions.push(`content_type = $${countParamIndex}`);
        countParams.push(contentType);
      }

      const whereClause = conditions.join(" AND ");
      const countWhereClause = countConditions.join(" AND ");

      const [rows, totalCount, contentTypes] = await Promise.all([
        runTabSafely<KnowledgeEmbeddingRow[]>(
          "knowledge",
          errors,
          () =>
            prisma.$queryRawUnsafe<KnowledgeEmbeddingRow[]>(
              `SELECT id, content_type, source_id, content_text, metadata, created_at
               FROM knowledge_embeddings
               WHERE ${whereClause}
               ORDER BY created_at DESC
               LIMIT $2 OFFSET $3`,
              ...params,
            ),
        ),
        runTabSafely<number>(
          "knowledge",
          errors,
          () =>
            prisma.$queryRawUnsafe<[{ count: bigint }]>(
              `SELECT count(*) FROM knowledge_embeddings WHERE ${countWhereClause}`,
              ...countParams,
            ).then((r) => Number(r[0]?.count ?? 0)),
        ),
        runTabSafely<string[]>(
          "knowledge",
          errors,
          () =>
            prisma.$queryRawUnsafe<KnowledgeContentTypeRow[]>(
              `SELECT DISTINCT content_type FROM knowledge_embeddings WHERE org_id = $1::uuid ORDER BY content_type`,
              orgId,
            ).then((r) => r.map((row) => row.content_type)),
        ),
      ]);

      result.knowledge = {
        rows: (rows ?? []).map((row) => ({
          id: row.id,
          contentType: row.content_type,
          sourceId: row.source_id,
          contentText: row.content_text,
          metadata: row.metadata,
          createdAt: row.created_at,
        })),
        total: totalCount ?? 0,
        page,
        contentTypes: contentTypes ?? [],
      };
    }

    if (shouldLoadMemory) {
      const subTab = request.nextUrl.searchParams.get("subTab") ?? "facts";

      if (subTab === "facts") {
        const [rows, total] = await Promise.all([
          runTabSafely("memory", errors, () =>
            prisma.memoryVerified.findMany({
              where: { orgId },
              orderBy: { createdAt: "desc" },
              skip: offset,
              take: limit,
              include: {
                entity: { select: { id: true, canonicalAddress: true, type: true } },
              },
            }),
          ),
          runTabSafely("memory", errors, () => prisma.memoryVerified.count({ where: { orgId } })),
        ]);

        result.memory = {
          subTab: "facts",
          rows: (rows ?? []).map((row) => ({
            id: row.id,
            entityId: row.entityId,
            entityAddress: row.entity?.canonicalAddress ?? "Unknown",
            entityType: row.entity?.type ?? "property",
            factType: row.factType,
            sourceType: row.sourceType,
            economicWeight: row.economicWeight,
            volatilityClass: row.volatilityClass,
            payloadJson: row.payloadJson,
            tier: row.tier,
            createdAt: row.createdAt,
          })),
          total: total ?? 0,
          page,
        };
      } else {
        const [rows, total] = await Promise.all([
          runTabSafely("memory", errors, () =>
            prisma.internalEntity.findMany({
              where: { orgId },
              orderBy: { createdAt: "desc" },
              skip: offset,
              take: limit,
              include: { _count: { select: { verifiedMemories: true } } },
            }),
          ),
          runTabSafely("memory", errors, () => prisma.internalEntity.count({ where: { orgId } })),
        ]);

        result.memory = {
          subTab: "entities",
          rows: (rows ?? []).map((row) => ({
            id: row.id,
            canonicalAddress: row.canonicalAddress,
            parcelId: row.parcelId,
            type: row.type,
            factsCount: row._count.verifiedMemories,
            createdAt: row.createdAt,
          })),
          total: total ?? 0,
          page,
        };
      }
    }

    if (shouldLoadAgents) {
      const now = new Date();
      const day1Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const day7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [runs, total, stats, dailyByRunType, learningCounts] = await Promise.all([
        runTabSafely("agents", errors, () => getAgentRuns(orgId, offset, limit)),
        runCountWithFallback(orgId, "run", "agents", errors),
        runTabSafely("agents", errors, async () => {
          const aggregate = await prisma.run.aggregate({
            where: { orgId, startedAt: { gte: day1Ago } },
            _count: true,
          });
          const succeeded = await runTabSafely("agents", errors, () =>
            prisma.run.count({ where: { orgId, startedAt: { gte: day1Ago }, status: "succeeded" } }),
          );

          return {
            total24h: aggregate._count,
            successRate: aggregate._count > 0 && succeeded ? Math.round((succeeded / aggregate._count) * 100) : 0,
          };
        }),
        runTabSafely(
          "agents",
          errors,
          () =>
            prisma.run.groupBy({
              by: ["runType"],
              where: { orgId, startedAt: { gte: day7Ago } },
              _count: true,
            }).then((rows) =>
              rows.map((row) => ({
                runType: row.runType,
                count: row._count,
              })),
            ),
        ),
        runTabSafely(
          "agents",
          errors,
          () =>
            Promise.all([
              runCountWithFallback(orgId, "trajectoryLog", "agents", errors),
              runCountWithFallback(orgId, "episodicEntry", "agents", errors),
              runCountWithFallback(orgId, "proceduralSkill", "agents", errors),
            ]).then(([trajectoryLogs, episodicEntries, proceduralSkills]) => ({
              trajectoryLogs,
              episodicEntries,
              proceduralSkills,
            })),
        ),
      ]);

      result.agents = {
        runs: (runs ?? []).map((run) => ({
          id: run.id,
          runType: run.runType,
          status: run.status,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          durationMs: run.finishedAt && run.startedAt ? run.finishedAt.getTime() - run.startedAt.getTime() : null,
          error: run.error,
          dealId: run.dealId,
          memoryPromotionStatus: run.memoryPromotionStatus,
          memoryPromotedAt: run.memoryPromotedAt,
          memoryPromotionError: run.memoryPromotionError,
        })),
        total: total ?? 0,
        page,
        stats: stats ?? { total24h: 0, successRate: 0 },
        dailyByRunType: dailyByRunType ?? [],
        learningCounts: learningCounts ?? {
          trajectoryLogs: 0,
          episodicEntries: 0,
          proceduralSkills: 0,
        },
      };
    }

    if (shouldLoadSystem) {
      const [
        runs,
        trajectoryLogs,
        episodicEntries,
        proceduralSkills,
        proceduralSkillEpisodes,
        memoryVerified,
        internalEntities,
        deals,
        conversations,
        knowledgeEmbeddings,
      ] = await Promise.all([
        runCountWithFallback(orgId, "run", "system", errors),
        runCountWithFallback(orgId, "trajectoryLog", "system", errors),
        runCountWithFallback(orgId, "episodicEntry", "system", errors),
        runCountWithFallback(orgId, "proceduralSkill", "system", errors),
        safeEpisodeCount(orgId, "system", errors),
        runCountWithFallback(orgId, "memoryVerified", "system", errors),
        runCountWithFallback(orgId, "internalEntity", "system", errors),
        runCountWithFallback(orgId, "deal", "system", errors),
        runCountWithFallback(orgId, "conversation", "system", errors),
        runTabSafely("system", errors, () =>
          prisma.$queryRawUnsafe<[{ count: bigint }]>(
            `SELECT count(*) FROM knowledge_embeddings WHERE org_id = $1::uuid`,
            orgId,
          ).then((r) => Number(r[0]?.count ?? 0)),
        ),
      ]);

      result.system = {
        tableCounts: {
          runs,
          trajectoryLogs,
          episodicEntries,
          proceduralSkills,
          proceduralSkillEpisodes,
          memoryVerified,
          internalEntities,
          deals,
          conversations,
          knowledgeEmbeddings,
        },
      };
    }

    if (Object.keys(errors).length > 0) {
      result.errors = errors;
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[admin/stats] unexpected error tab=%s", tab, message, stack);
    return NextResponse.json(
      { error: "Internal server error", detail: message, tab },
      { status: 500 },
    );
  }
}
