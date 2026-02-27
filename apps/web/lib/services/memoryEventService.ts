import "server-only";
import { prisma } from "@entitlement-os/db";
import type { Prisma } from "@entitlement-os/db";
import { resolveEntityId } from "./entityResolution";
import { generateRequestId } from "@/lib/server/requestContext";

interface RecordEventParams {
  orgId: string;
  entityId?: string | null;
  address?: string | null;
  parcelId?: string | null;
  entityType?: string | null;
  dealId?: string | null;
  threadId?: string | null;
  userId?: string | null;
  sourceType: string;
  factType: string;
  payloadJson: Record<string, unknown>;
  status: string;
  modelTraceId?: string | null;
  toolName?: string | null;
  latencyMs?: number | null;
  tokenUsage?: number | null;
  costUsd?: number | null;
}

interface GetEntityMemoryFilters {
  factType?: string;
  sourceType?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

class MemoryEventService {
  async recordEvent(params: RecordEventParams) {
    const entityId =
      params.entityId ??
      (await resolveEntityId({
        address: params.address,
        parcelId: params.parcelId,
        type: params.entityType,
        orgId: params.orgId,
      }));

    const event = await prisma.memoryEventLog.create({
      data: {
        orgId: params.orgId,
        entityId,
        dealId: params.dealId ?? null,
        threadId: params.threadId ?? null,
        userId: params.userId ?? null,
        sourceType: params.sourceType,
        factType: params.factType,
        payloadJson: params.payloadJson as Prisma.InputJsonValue,
        status: params.status,
        conflictFlag: false,
        requestId: generateRequestId(),
        modelTraceId: params.modelTraceId ?? null,
        toolName: params.toolName ?? null,
        latencyMs: params.latencyMs ?? null,
        tokenUsage: params.tokenUsage ?? null,
        costUsd: params.costUsd ?? null,
      },
    });

    return event;
  }

  async getEntityMemory(
    entityId: string,
    orgId: string,
    filters?: GetEntityMemoryFilters,
  ) {
    const limit = Math.min(filters?.limit ?? 50, 100);

    const where: Prisma.MemoryEventLogWhereInput = {
      entityId,
      orgId,
    };
    if (filters?.factType) where.factType = filters.factType;
    if (filters?.sourceType) where.sourceType = filters.sourceType;
    if (filters?.status) where.status = filters.status;
    if (filters?.cursor) {
      where.id = { gt: filters.cursor };
    }

    const events = await prisma.memoryEventLog.findMany({
      where,
      orderBy: { timestamp: "asc" },
      take: limit + 1,
    });

    const hasMore = events.length > limit;
    const results = hasMore ? events.slice(0, limit) : events;
    const nextCursor = hasMore ? results[results.length - 1].id : null;

    return {
      events: results,
      pagination: {
        hasMore,
        nextCursor,
        limit,
      },
    };
  }

  async getEventStats(orgId: string, days: number = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const where: Prisma.MemoryEventLogWhereInput = {
      orgId,
      timestamp: { gte: since },
    };

    const [total, byStatus, byFactType, bySourceType, recentEvents] =
      await prisma.$transaction([
        prisma.memoryEventLog.count({ where }),
        prisma.memoryEventLog.groupBy({
          by: ["status"],
          where,
          orderBy: { status: "asc" },
          _count: true,
        }),
        prisma.memoryEventLog.groupBy({
          by: ["factType"],
          where,
          orderBy: { factType: "asc" },
          _count: true,
        }),
        prisma.memoryEventLog.groupBy({
          by: ["sourceType"],
          where,
          orderBy: { sourceType: "asc" },
          _count: true,
        }),
        prisma.memoryEventLog.findMany({
          where,
          orderBy: { timestamp: "desc" },
          take: 50,
          include: {
            entity: {
              select: {
                id: true,
                canonicalAddress: true,
                parcelId: true,
                type: true,
              },
            },
          },
        }),
      ]);

    return {
      total,
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
      byFactType: byFactType.map((f) => ({
        factType: f.factType,
        count: f._count,
      })),
      bySourceType: bySourceType.map((s) => ({
        sourceType: s.sourceType,
        count: s._count,
      })),
      recentEvents,
      days,
    };
  }
}

let _instance: MemoryEventService | null = null;

export function getMemoryEventService(): MemoryEventService {
  if (!_instance) _instance = new MemoryEventService();
  return _instance;
}
