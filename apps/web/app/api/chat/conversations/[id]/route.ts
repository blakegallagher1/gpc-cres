import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { isChatPersistenceUnavailable } from "@/app/api/chat/_lib/errorHandling";
import { shouldUseAppDatabaseDevFallback } from "@/lib/server/appDbEnv";

type PendingApprovalRecord = {
  toolCallId: string | null;
  toolName: string | null;
};

function readPendingApproval(outputJson: unknown): PendingApprovalRecord | null {
  if (!outputJson || typeof outputJson !== "object" || Array.isArray(outputJson)) {
    return null;
  }

  const pendingApproval = (outputJson as { pendingApproval?: unknown }).pendingApproval;
  if (
    !pendingApproval ||
    typeof pendingApproval !== "object" ||
    Array.isArray(pendingApproval)
  ) {
    return null;
  }

  const record = pendingApproval as {
    toolCallId?: unknown;
    toolName?: unknown;
  };

  return {
    toolCallId: typeof record.toolCallId === "string" ? record.toolCallId : null,
    toolName: typeof record.toolName === "string" ? record.toolName : null,
  };
}

// GET /api/chat/conversations/[id] — get a conversation with all messages
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (shouldUseAppDatabaseDevFallback()) {
    return NextResponse.json({ conversation: null, degraded: true });
  }

  try {
    const [conversation, pendingApprovalRun] = await Promise.all([
      prisma.conversation.findFirst({
        where: { id, orgId: auth.orgId },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              role: true,
              content: true,
              agentName: true,
              toolCalls: true,
              metadata: true,
              createdAt: true,
            },
          },
          deal: {
            select: { id: true, name: true, status: true },
          },
        },
      }),
      prisma.run.findFirst({
        where: {
          orgId: auth.orgId,
          status: "running",
          outputJson: {
            path: ["pendingApproval", "conversationId"],
            equals: id,
          },
        },
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          startedAt: true,
          outputJson: true,
        },
      }),
    ]);

    if (!conversation) {
      return NextResponse.json({ conversation: null });
    }

    const messages = conversation.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      agentName: m.agentName,
      toolCalls: m.toolCalls,
      metadata: m.metadata,
      createdAt: m.createdAt.toISOString(),
    }));

    const pendingApproval = pendingApprovalRun
      ? readPendingApproval(pendingApprovalRun.outputJson)
      : null;

    if (pendingApprovalRun && pendingApproval) {
      const toolName = pendingApproval.toolName ?? "tool";
      messages.push({
        id: `pending-approval-${pendingApprovalRun.id}`,
        role: "system",
        content: `Approval required for ${toolName}`,
        agentName: null,
        toolCalls: [
          {
            name: toolName,
          },
        ],
        metadata: {
          kind: "tool_approval_requested",
          runId: pendingApprovalRun.id,
          toolCallId: pendingApproval.toolCallId,
          toolName,
          pendingApproval: true,
        },
        createdAt: pendingApprovalRun.startedAt.toISOString(),
      });

      messages.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    }

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        dealId: conversation.dealId,
        deal: conversation.deal,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
        messages,
      },
    });
  } catch (error) {
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
  const auth = await resolveAuth(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (shouldUseAppDatabaseDevFallback()) {
    return NextResponse.json(
      { error: "Conversation store unavailable", degraded: true },
      { status: 503 },
    );
  }

  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: auth.orgId },
      select: { id: true },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    await prisma.conversation.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
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
