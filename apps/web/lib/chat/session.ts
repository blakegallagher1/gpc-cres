import { prisma } from "@entitlement-os/db";
import type { Prisma } from "@entitlement-os/db";

const DEFAULT_HISTORY_LIMIT = 50;
const DEFAULT_COMPACTION_TOKEN_THRESHOLD = 6000;
const DEFAULT_COMPACTION_KEEP_RECENT_MESSAGES = 24;
const DEFAULT_DEDUPE_LOOKBACK = 200;

const SESSION_ROLE_SET = new Set(["user", "assistant", "system", "tool"]);

export type SessionRole = "user" | "assistant" | "system" | "tool";

export type SessionItem = {
  role: SessionRole;
  content: string;
  metadata?: Prisma.InputJsonValue;
  createdAt?: Date;
};

export type SessionCompactionResult = {
  compacted: boolean;
  previousTokenEstimate: number;
  removedMessageCount: number;
  summaryMessageId?: string;
};

type PrismaSessionOptions = {
  orgId: string;
  userId: string;
  conversationId?: string | null;
  dealId?: string | null;
  title?: string;
  autoCreate?: boolean;
  historyLimit?: number;
  compactionTokenThreshold?: number;
  compactionKeepRecentMessages?: number;
  dedupeLookback?: number;
};

function normalizeRole(role: string): SessionRole | null {
  if (!SESSION_ROLE_SET.has(role)) return null;
  return role as SessionRole;
}

function normalizeText(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}

function fingerprint(role: SessionRole, content: string): string {
  return `${role}:${normalizeText(content).toLowerCase()}`;
}

function estimateTokenCount(messages: Array<{ content: string }>): number {
  const chars = messages.reduce((sum, item) => sum + item.content.length, 0);
  return Math.ceil(chars / 4);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function buildCompactionSummary(messages: Array<{ role: SessionRole; content: string }>): string {
  const highlights = messages
    .filter((entry) => entry.role === "user" || entry.role === "assistant")
    .slice(-12)
    .map((entry) => `- ${entry.role}: ${truncate(normalizeText(entry.content), 240)}`);

  if (highlights.length === 0) {
    return "Conversation summary (auto-compacted): previous context collapsed to maintain token budget.";
  }

  return [
    "Conversation summary (auto-compacted to maintain token budget):",
    ...highlights,
  ].join("\n");
}

export class PrismaChatSession {
  private conversationId: string | null;
  private readonly orgId: string;
  private readonly userId: string;
  private readonly dealId: string | null;
  private readonly title: string;
  private readonly autoCreate: boolean;
  private readonly historyLimit: number;
  private readonly compactionTokenThreshold: number;
  private readonly compactionKeepRecentMessages: number;
  private readonly dedupeLookback: number;

  private constructor(options: PrismaSessionOptions) {
    this.orgId = options.orgId;
    this.userId = options.userId;
    this.conversationId = options.conversationId ?? null;
    this.dealId = options.dealId ?? null;
    this.title = options.title ?? "Agent run";
    this.autoCreate = options.autoCreate ?? false;
    this.historyLimit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT;
    this.compactionTokenThreshold =
      options.compactionTokenThreshold ??
      Number(process.env.AGENT_SESSION_COMPACTION_TOKEN_THRESHOLD ?? DEFAULT_COMPACTION_TOKEN_THRESHOLD);
    this.compactionKeepRecentMessages =
      options.compactionKeepRecentMessages ??
      Number(
        process.env.AGENT_SESSION_COMPACTION_KEEP_RECENT_MESSAGES ??
          DEFAULT_COMPACTION_KEEP_RECENT_MESSAGES,
      );
    this.dedupeLookback =
      options.dedupeLookback ??
      Number(process.env.AGENT_SESSION_DEDUPE_LOOKBACK ?? DEFAULT_DEDUPE_LOOKBACK);
  }

  static async create(options: PrismaSessionOptions): Promise<PrismaChatSession> {
    const session = new PrismaChatSession(options);
    await session.ensureConversation();
    return session;
  }

  getConversationId(): string | null {
    return this.conversationId;
  }

  async getItems(options?: { limit?: number }): Promise<SessionItem[]> {
    if (!this.conversationId) return [];

    const limit = options?.limit ?? this.historyLimit;
    const rows = await prisma.message.findMany({
      where: { conversationId: this.conversationId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        role: true,
        content: true,
        metadata: true,
        createdAt: true,
      },
    });

    return rows
      .reverse()
      .map((row) => {
        const role = normalizeRole(row.role);
        if (!role) return null;
        return {
          role,
          content: row.content,
          metadata: row.metadata as Prisma.InputJsonValue | undefined,
          createdAt: row.createdAt,
        } as SessionItem;
      })
      .filter((row): row is SessionItem => row !== null);
  }

  async addItems(items: SessionItem[]): Promise<void> {
    if (items.length === 0) return;
    await this.ensureConversation();
    if (!this.conversationId) return;

    const existing = await prisma.message.findMany({
      where: { conversationId: this.conversationId },
      orderBy: { createdAt: "desc" },
      take: this.dedupeLookback,
      select: { role: true, content: true },
    });

    const frequencyMap = this.buildItemFrequencyMap(
      existing
        .map((entry) => {
          const role = normalizeRole(entry.role);
          if (!role) return null;
          return { role, content: entry.content };
        })
        .filter((entry): entry is { role: SessionRole; content: string } => entry !== null),
    );

    const insertRows: Array<{
      conversationId: string;
      role: string;
      content: string;
      metadata?: Prisma.InputJsonValue;
    }> = [];

    for (const item of items) {
      const role = normalizeRole(item.role);
      if (!role) continue;
      const content = normalizeText(item.content);
      if (!content) continue;

      const itemFingerprint = fingerprint(role, content);
      const isDuplicate = role !== "user" && (frequencyMap.get(itemFingerprint) ?? 0) > 0;
      if (isDuplicate) continue;

      frequencyMap.set(itemFingerprint, (frequencyMap.get(itemFingerprint) ?? 0) + 1);

      insertRows.push({
        conversationId: this.conversationId,
        role,
        content,
        metadata: item.metadata,
      });
    }

    if (insertRows.length === 0) return;

    await prisma.message.createMany({
      data: insertRows,
    });
  }

  async runCompaction(): Promise<SessionCompactionResult> {
    if (!this.conversationId) {
      return {
        compacted: false,
        previousTokenEstimate: 0,
        removedMessageCount: 0,
      };
    }

    const rows = await prisma.message.findMany({
      where: { conversationId: this.conversationId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
      },
    });

    const tokenEstimate = estimateTokenCount(rows);
    if (tokenEstimate <= this.compactionTokenThreshold) {
      return {
        compacted: false,
        previousTokenEstimate: tokenEstimate,
        removedMessageCount: 0,
      };
    }

    if (rows.length <= this.compactionKeepRecentMessages) {
      return {
        compacted: false,
        previousTokenEstimate: tokenEstimate,
        removedMessageCount: 0,
      };
    }

    const removed = rows.slice(0, rows.length - this.compactionKeepRecentMessages);
    const summary = buildCompactionSummary(
      removed
        .map((row) => {
          const role = normalizeRole(row.role);
          if (!role) return null;
          return { role, content: row.content };
        })
        .filter((entry): entry is { role: SessionRole; content: string } => entry !== null),
    );

    const summaryMessage = await prisma.$transaction(async (tx) => {
      await tx.message.deleteMany({
        where: { id: { in: removed.map((row) => row.id) } },
      });

      return tx.message.create({
        data: {
          conversationId: this.conversationId!,
          role: "system",
          content: summary,
          metadata: {
            kind: "session_compaction",
            compactedMessageCount: removed.length,
            previousTokenEstimate: tokenEstimate,
            compactedAt: new Date().toISOString(),
          } satisfies Prisma.InputJsonObject,
        },
        select: { id: true },
      });
    });

    return {
      compacted: true,
      previousTokenEstimate: tokenEstimate,
      removedMessageCount: removed.length,
      summaryMessageId: summaryMessage.id,
    };
  }

  private buildItemFrequencyMap(
    items: Array<{ role: SessionRole; content: string }>,
  ): Map<string, number> {
    const map = new Map<string, number>();
    for (const item of items) {
      const itemFingerprint = fingerprint(item.role, item.content);
      map.set(itemFingerprint, (map.get(itemFingerprint) ?? 0) + 1);
    }
    return map;
  }

  private async ensureConversation(): Promise<void> {
    if (this.conversationId) {
      const existing = await prisma.conversation.findFirst({
        where: { id: this.conversationId, orgId: this.orgId },
        select: { id: true },
      });
      if (!existing) {
        throw new Error("Conversation not found");
      }
      return;
    }

    if (!this.autoCreate) return;

    const created = await prisma.conversation.create({
      data: {
        orgId: this.orgId,
        userId: this.userId,
        dealId: this.dealId,
        title: this.title,
      },
      select: { id: true },
    });

    this.conversationId = created.id;
  }
}
