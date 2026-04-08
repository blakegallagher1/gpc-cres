import { NextRequest, NextResponse } from "next/server";
import {
  deleteConversationForOrg,
  getConversationForOrg,
} from "@gpc/server";
import { authorizeApiRoute } from "@/lib/auth/authorizeApiRoute";
import { isChatPersistenceUnavailable } from "@/app/api/chat/_lib/errorHandling";
import { shouldUseAppDatabaseDevFallback } from "@/lib/server/appDbEnv";
import * as Sentry from "@sentry/nextjs";

// GET /api/chat/conversations/[id] — get a conversation with all messages
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeApiRoute(req, req.nextUrl.pathname);
  if (!authorization.ok || !authorization.auth) {
    return authorization.ok
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : authorization.response;
  }
  const auth = authorization.auth;

  const { id } = await params;

  if (shouldUseAppDatabaseDevFallback()) {
    return NextResponse.json({ conversation: null, degraded: true });
  }

  try {
    const conversation = await getConversationForOrg(auth.orgId, id);

    if (!conversation) {
      return NextResponse.json({ conversation: null });
    }

    return NextResponse.json({ conversation });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.chat.conversations", method: "GET" },
    });
    if (isChatPersistenceUnavailable(error)) {
      return NextResponse.json({ conversation: null, degraded: true });
    }

    console.error("[chat-conversation-detail]", error);

    return NextResponse.json(
      { error: "Failed to load conversation" },
      { status: 500 },
    );
  }
}

// DELETE /api/chat/conversations/[id] — delete a conversation
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeApiRoute(req, req.nextUrl.pathname);
  if (!authorization.ok || !authorization.auth) {
    return authorization.ok
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : authorization.response;
  }
  const auth = authorization.auth;

  const { id } = await params;

  if (shouldUseAppDatabaseDevFallback()) {
    return NextResponse.json(
      { error: "Conversation store unavailable", degraded: true },
      { status: 503 },
    );
  }

  try {
    const deleted = await deleteConversationForOrg(auth.orgId, id);
    if (!deleted) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.chat.conversations", method: "DELETE" },
    });
    if (isChatPersistenceUnavailable(error)) {
      return NextResponse.json(
        { error: "Conversation store unavailable", degraded: true },
        { status: 503 },
      );
    }

    console.error("[chat-conversation-delete]", error);

    return NextResponse.json(
      { error: "Failed to delete conversation" },
      { status: 500 },
    );
  }
}
