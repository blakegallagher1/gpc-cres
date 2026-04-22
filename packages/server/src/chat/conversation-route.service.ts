import { prisma } from "@entitlement-os/db";

const DB_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ConversationListItem = {
  id: string;
  title: string | null;
  dealId: string | null;
  updatedAt: string;
  messageCount: number;
};

export type ConversationMessageItem = {
  id: string;
  role: string;
  content: unknown;
  agentName: string | null;
  toolCalls: unknown;
  metadata: unknown;
  createdAt: string;
};

export type ConversationDetail = {
  id: string;
  title: string | null;
  dealId: string | null;
  deal: {
    id: string;
    name: string;
    status: string;
  } | null;
  createdAt: string;
  updatedAt: string;
  messages: ConversationMessageItem[];
};

type PendingApprovalRecord = {
  toolCallId: string | null;
  toolName: string | null;
};

function isDatabaseUuid(value: string): boolean {
  return DB_UUID_REGEX.test(value.trim());
}

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

export async function listConversationsForOrg(
  orgId: string,
): Promise<ConversationListItem[]> {
  const conversations = await prisma.conversation.findMany({
    where: { orgId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      dealId: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });

  return conversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    dealId: conversation.dealId,
    updatedAt: conversation.updatedAt.toISOString(),
    messageCount: conversation._count.messages,
  }));
}

export async function getConversationForOrg(
  orgId: string,
  conversationId: string,
): Promise<ConversationDetail | null> {
  if (!isDatabaseUuid(conversationId)) {
    return null;
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, orgId },
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
  });

  if (!conversation) {
    return null;
  }

  const pendingApprovalRun = await prisma.run
    .findFirst({
      where: {
        orgId,
        status: "running",
        outputJson: {
          path: ["pendingApproval", "conversationId"],
          equals: conversationId,
        },
      },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        startedAt: true,
        outputJson: true,
      },
    })
    .catch(() => null);

  const messages: ConversationMessageItem[] = conversation.messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    agentName: message.agentName,
    toolCalls: message.toolCalls,
    metadata: message.metadata,
    createdAt: message.createdAt.toISOString(),
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
      toolCalls: [{ name: toolName }],
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
      (left, right) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    );
  }

  return {
    id: conversation.id,
    title: conversation.title,
    dealId: conversation.dealId,
    deal: conversation.deal,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    messages,
  };
}

/**
 * Derives a short, human-readable title from a raw user message.
 * Strips common filler prefixes, capitalizes words, and truncates to 50 chars.
 * Example: "tell me about 7618 copperfield ct" → "7618 Copperfield Ct"
 */
export function deriveConversationTitle(rawMessage: string): string {
  const FILLER_PREFIXES = [
    /^tell me about\s+/i,
    /^what(?:'s| is) the\s+/i,
    /^what(?:'s| is)\s+/i,
    /^can you\s+/i,
    /^could you\s+/i,
    /^please\s+/i,
    /^i(?:'d| would) like(?: to)?\s+/i,
    /^show me\s+/i,
    /^give me\s+/i,
    /^help me\s+/i,
    /^run\s+/i,
    /^get\s+/i,
    /^find\s+/i,
    /^look up\s+/i,
  ];

  // Strip map context prefix if present
  let text = rawMessage.replace(/^\[Map Context\][\s\S]*?\[\/Map Context\]\s*/i, "").trim();

  // Take first sentence only (split on . ! ? followed by whitespace or end)
  const sentenceEnd = text.search(/[.!?](\s|$)/);
  if (sentenceEnd > 0 && sentenceEnd < text.length) {
    text = text.slice(0, sentenceEnd).trim();
  }

  // Strip filler prefix
  for (const pattern of FILLER_PREFIXES) {
    text = text.replace(pattern, "");
  }

  // Capitalize each word
  text = text
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

  // Truncate to 50 chars, breaking at a word boundary
  if (text.length > 50) {
    const truncated = text.slice(0, 50);
    const lastSpace = truncated.lastIndexOf(" ");
    text = lastSpace > 30 ? truncated.slice(0, lastSpace) : truncated;
    text = text.replace(/[,;:–—-]+$/, "").trim();
  }

  return text || "New conversation";
}

export async function updateConversationTitleForOrg(
  orgId: string,
  conversationId: string,
  title: string,
): Promise<boolean> {
  if (!isDatabaseUuid(conversationId)) {
    return false;
  }

  const trimmed = title.trim().slice(0, 255);
  if (!trimmed) return false;

  const updated = await prisma.conversation.updateMany({
    where: { id: conversationId, orgId },
    data: { title: trimmed },
  });

  return updated.count > 0;
}

export async function deleteConversationForOrg(
  orgId: string,
  conversationId: string,
): Promise<boolean> {
  if (!isDatabaseUuid(conversationId)) {
    return false;
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, orgId },
    select: { id: true },
  });

  if (!conversation) {
    return false;
  }

  await prisma.conversation.delete({ where: { id: conversationId } });
  return true;
}
