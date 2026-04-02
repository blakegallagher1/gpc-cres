import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { authorizeApiRoute } from "@/lib/auth/authorizeApiRoute";
import { isChatPersistenceUnavailable } from "@/app/api/chat/_lib/errorHandling";
import { shouldUseAppDatabaseDevFallback } from "@/lib/server/appDbEnv";
import * as Sentry from "@sentry/nextjs";

// GET /api/chat/conversations — list conversations for the current user's org
export async function GET(request: NextRequest) {
  const authorization = await authorizeApiRoute(request, request.nextUrl.pathname);
  if (!authorization.ok || !authorization.auth) {
    return authorization.ok
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : authorization.response;
  }
  const auth = authorization.auth;

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
    Sentry.captureException(error, {
      tags: { route: "api.chat.conversations", method: "GET" },
    });
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
