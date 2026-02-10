import { prisma } from "@entitlement-os/db";
import type { Prisma } from "@entitlement-os/db";
import { AppError } from "@/lib/errors";

// Re-export the Prisma enum values as a convenience
export type NotificationType =
  | "ALERT"
  | "OPPORTUNITY"
  | "DEADLINE"
  | "SYSTEM"
  | "MARKET"
  | "AUTOMATION";

export type NotificationPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface CreateNotificationInput {
  orgId: string;
  userId: string;
  dealId?: string | null;
  type?: NotificationType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  priority?: NotificationPriority;
  actionUrl?: string | null;
  sourceAgent?: string | null;
}

export interface NotificationFilters {
  type?: NotificationType;
  priority?: NotificationPriority;
  unreadOnly?: boolean;
  dealId?: string;
  limit?: number;
  offset?: number;
}

export interface PaginatedNotifications {
  notifications: Awaited<ReturnType<typeof prisma.notification.findMany>>;
  total: number;
  hasMore: boolean;
}

export class NotificationService {
  async create(input: CreateNotificationInput) {
    return prisma.notification.create({
      data: {
        orgId: input.orgId,
        userId: input.userId,
        dealId: input.dealId ?? null,
        type: input.type ?? "SYSTEM",
        title: input.title,
        body: input.body,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        priority: input.priority ?? "MEDIUM",
        actionUrl: input.actionUrl ?? null,
        sourceAgent: input.sourceAgent ?? null,
      },
    });
  }

  async createBatch(inputs: CreateNotificationInput[]) {
    if (inputs.length === 0) return [];

    // Prisma doesn't return records from createMany, so use a transaction
    return prisma.$transaction(
      inputs.map((input) =>
        prisma.notification.create({
          data: {
            orgId: input.orgId,
            userId: input.userId,
            dealId: input.dealId ?? null,
            type: input.type ?? "SYSTEM",
            title: input.title,
            body: input.body,
            metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
            priority: input.priority ?? "MEDIUM",
            actionUrl: input.actionUrl ?? null,
            sourceAgent: input.sourceAgent ?? null,
          },
        })
      )
    );
  }

  async getAll(
    userId: string,
    filters: NotificationFilters = {}
  ): Promise<PaginatedNotifications> {
    const limit = Math.min(filters.limit ?? 20, 100);
    const offset = filters.offset ?? 0;

    const where: Prisma.NotificationWhereInput = {
      userId,
      dismissedAt: null, // Never show dismissed
    };
    if (filters.type) where.type = filters.type;
    if (filters.priority) where.priority = filters.priority;
    if (filters.unreadOnly) where.readAt = null;
    if (filters.dealId) where.dealId = filters.dealId;

    const [notifications, total] = await prisma.$transaction([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          deal: { select: { id: true, name: true } },
        },
      }),
      prisma.notification.count({ where }),
    ]);

    return {
      notifications,
      total,
      hasMore: offset + limit < total,
    };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: { userId, readAt: null, dismissedAt: null },
    });
  }

  async markRead(id: string, userId: string): Promise<void> {
    const result = await prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      throw new AppError("Notification not found", "NOT_FOUND", 404);
    }
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { userId, readAt: null, dismissedAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  async dismiss(id: string, userId: string): Promise<void> {
    const result = await prisma.notification.updateMany({
      where: { id, userId },
      data: { dismissedAt: new Date() },
    });
    if (result.count === 0) {
      throw new AppError("Notification not found", "NOT_FOUND", 404);
    }
  }
}

// Singleton for use in automation handlers (avoids repeated instantiation)
let _instance: NotificationService | null = null;

export function getNotificationService(): NotificationService {
  if (!_instance) _instance = new NotificationService();
  return _instance;
}
