import { beforeEach, describe, expect, it, vi } from "vitest";

type DbConversation = {
  id: string;
  orgId: string;
  userId: string;
  dealId: string | null;
  title: string | null;
};

type DbMessage = {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  metadata?: unknown;
  createdAt: Date;
};

const state = vi.hoisted(() => ({
  conversations: [] as DbConversation[],
  messages: [] as DbMessage[],
  nowTick: 0,
}));

const prismaMock = vi.hoisted(() => ({
  conversation: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  message: {
    findMany: vi.fn(),
    createMany: vi.fn(),
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

function nextDate(): Date {
  state.nowTick += 1;
  return new Date(1704067200000 + state.nowTick * 1000);
}

function resetState() {
  state.conversations = [
    {
      id: "conv-1",
      orgId: "org-1",
      userId: "user-1",
      dealId: null,
      title: "Existing conversation",
    },
  ];
  state.messages = [];
  state.nowTick = 0;
}

function installPrismaHandlers() {
  prismaMock.conversation.findFirst.mockImplementation(async (args: { where: { id?: string; orgId?: string } }) => {
    const { id, orgId } = args.where;
    const found = state.conversations.find(
      (entry) => (id ? entry.id === id : true) && (orgId ? entry.orgId === orgId : true),
    );
    return found ? { id: found.id } : null;
  });

  prismaMock.conversation.create.mockImplementation(
    async (args: {
      data: { orgId: string; userId: string; dealId?: string | null; title?: string | null };
      select?: { id?: boolean };
    }) => {
      const id = `conv-${state.conversations.length + 1}`;
      state.conversations.push({
        id,
        orgId: args.data.orgId,
        userId: args.data.userId,
        dealId: args.data.dealId ?? null,
        title: args.data.title ?? null,
      });
      return { id };
    },
  );

  prismaMock.message.findMany.mockImplementation(
    async (args: {
      where: { conversationId: string };
      orderBy: { createdAt: "asc" | "desc" };
      take?: number;
      select?: {
        id?: boolean;
        role?: boolean;
        content?: boolean;
        metadata?: boolean;
        createdAt?: boolean;
      };
    }) => {
      let rows = state.messages.filter((row) => row.conversationId === args.where.conversationId);
      rows = rows.sort((a, b) =>
        args.orderBy.createdAt === "asc"
          ? a.createdAt.getTime() - b.createdAt.getTime()
          : b.createdAt.getTime() - a.createdAt.getTime(),
      );
      if (typeof args.take === "number") {
        rows = rows.slice(0, args.take);
      }
      return rows.map((row) => {
        if (!args.select) return row;
        return {
          ...(args.select.id ? { id: row.id } : {}),
          ...(args.select.role ? { role: row.role } : {}),
          ...(args.select.content ? { content: row.content } : {}),
          ...(args.select.metadata ? { metadata: row.metadata } : {}),
          ...(args.select.createdAt ? { createdAt: row.createdAt } : {}),
        };
      });
    },
  );

  prismaMock.message.createMany.mockImplementation(
    async (args: {
      data: Array<{
        conversationId: string;
        role: string;
        content: string;
        metadata?: unknown;
      }>;
    }) => {
      for (const item of args.data) {
        state.messages.push({
          id: `msg-${state.messages.length + 1}`,
          conversationId: item.conversationId,
          role: item.role,
          content: item.content,
          metadata: item.metadata,
          createdAt: nextDate(),
        });
      }
      return { count: args.data.length };
    },
  );

  prismaMock.message.deleteMany.mockImplementation(async (args: { where: { id: { in: string[] } } }) => {
    const idSet = new Set(args.where.id.in);
    const before = state.messages.length;
    state.messages = state.messages.filter((message) => !idSet.has(message.id));
    return { count: before - state.messages.length };
  });

  prismaMock.message.create.mockImplementation(
    async (args: {
      data: {
        conversationId: string;
        role: string;
        content: string;
        metadata?: unknown;
      };
      select?: { id?: boolean };
    }) => {
      const row = {
        id: `msg-${state.messages.length + 1}`,
        conversationId: args.data.conversationId,
        role: args.data.role,
        content: args.data.content,
        metadata: args.data.metadata,
        createdAt: nextDate(),
      };
      state.messages.push(row);
      if (args.select?.id) return { id: row.id };
      return row;
    },
  );

  prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => Promise<unknown>) => {
    return callback(prismaMock);
  });
}

vi.mock("@entitlement-os/db", () => ({
  prisma: prismaMock,
}));

import { PrismaChatSession } from "../session";

describe("PrismaChatSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetState();
    installPrismaHandlers();
    process.env.AGENT_SESSION_COMPACTION_TOKEN_THRESHOLD = "60";
    process.env.AGENT_SESSION_COMPACTION_KEEP_RECENT_MESSAGES = "4";
  });

  it("auto-compacts long conversations and inserts a summary system message", async () => {
    const session = await PrismaChatSession.create({
      orgId: "org-1",
      userId: "user-1",
      conversationId: "conv-1",
    });

    for (let i = 0; i < 12; i += 1) {
      await session.addItems([
        {
          role: i % 2 === 0 ? "user" : "assistant",
          content: `Long context message ${i} ${"x".repeat(80)}`,
        },
      ]);
    }

    const compaction = await session.runCompaction();
    const items = await session.getItems({ limit: 50 });

    expect(compaction.compacted).toBe(true);
    expect(compaction.removedMessageCount).toBeGreaterThan(0);
    expect(items.some((entry) => entry.role === "system" && entry.content.includes("auto-compacted"))).toBe(
      true,
    );
    expect(items.some((entry) => entry.content.includes("Long context message 11"))).toBe(true);
  });

  it("deduplicates repeated tool/context items while preserving unique items", async () => {
    const session = await PrismaChatSession.create({
      orgId: "org-1",
      userId: "user-1",
      conversationId: "conv-1",
    });

    await session.addItems([
      { role: "tool", content: "parcel boundary fetched for APN 123" },
      { role: "tool", content: "parcel boundary fetched for APN 123" },
      { role: "tool", content: "heatmap layer refreshed" },
    ]);

    const items = await session.getItems({ limit: 50 });
    const duplicateCount = items.filter(
      (entry) => entry.role === "tool" && entry.content === "parcel boundary fetched for APN 123",
    ).length;

    expect(duplicateCount).toBe(1);
    expect(items.some((entry) => entry.content === "heatmap layer refreshed")).toBe(true);
  });

  it("persists session state across reloads via conversation ID", async () => {
    const firstSession = await PrismaChatSession.create({
      orgId: "org-1",
      userId: "user-1",
      conversationId: "conv-1",
    });

    await firstSession.addItems([
      { role: "user", content: "Analyze this parcel set for truck parking potential." },
      { role: "assistant", content: "Running parcel screening now." },
    ]);

    const reloadedSession = await PrismaChatSession.create({
      orgId: "org-1",
      userId: "user-1",
      conversationId: "conv-1",
    });

    const items = await reloadedSession.getItems({ limit: 50 });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      role: "user",
      content: "Analyze this parcel set for truck parking potential.",
    });
    expect(items[1]).toMatchObject({
      role: "assistant",
      content: "Running parcel screening now.",
    });
  });
});
