import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { isChatPersistenceUnavailable } from "@/app/api/chat/_lib/errorHandling";
import { shouldUseAppDatabaseDevFallback } from "@/lib/server/appDbEnv";

// GET /api/chat/conversations — list conversations for the current user's org
export async function GET(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (shouldUseAppDatabaseDevFallback()) {
    return NextResponse.json({ conversations: [], degraded: true });
  }

  try {
    const conversations = await prisma.conversation.findMany({
      where: { orgId: auth.orgId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        dealId: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });

    return NextResponse.json({
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        dealId: c.dealId,
        updatedAt: c.updatedAt.toISOString(),
        messageCount: c._count.messages,
      })),
    });
  } catch (error) {
    if (isChatPersistenceUnavailable(error)) {
      return NextResponse.json({ conversations: [], degraded: true });
    }

    console.error("[chat-conversations]", error);

    return NextResponse.json(
      { error: "Failed to load conversations" },
      { status: 500 },
    );
  }
}
