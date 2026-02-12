import { prisma } from "@entitlement-os/db";
import {
  executeAgentWorkflow,
  type AgentInputMessage,
  type AgentStreamEvent,
} from "./executeAgent";

export type AgentRunInput = {
  orgId: string;
  userId: string;
  conversationId?: string | null;
  message?: string | null;
  input?: AgentInputMessage[];
  dealId?: string | null;
  jurisdictionId?: string | null;
  sku?: string | null;
  runType?: string;
  maxTurns?: number;
  persistConversation?: boolean;
  injectSystemContext?: boolean;
  onEvent?: (event: AgentStreamEvent) => void;
};

type DealContext = {
  id: string;
  name: string;
  status: string;
  sku: string;
  jurisdiction: {
    id: string;
    name: string;
    state: string;
  } | null;
};

type JurisdictionContext = {
  id: string;
  name: string;
  state: string;
};

function buildSystemContext(
  orgId: string,
  userId: string,
  dealId?: string | null,
  jurisdictionId?: string | null,
  sku?: string | null,
) {
  return [
    `[System context — use these values when calling tools]`,
    `orgId: ${orgId}`,
    `userId: ${userId}`,
    dealId ? `dealId: ${dealId}` : "",
    jurisdictionId ? `jurisdictionId: ${jurisdictionId}` : "",
    sku ? `sku: ${sku}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildJurisdictionContext(jurisdiction: JurisdictionContext | null) {
  if (!jurisdiction) return "";
  return [
    "Active jurisdiction context:",
    `jurisdictionId: ${jurisdiction.id}`,
    `jurisdiction: ${jurisdiction.name}, ${jurisdiction.state}`,
  ].join("\n");
}

function toAgentInputMessage(entry: {
  role: string;
  content: string;
}): AgentInputMessage | null {
  if (entry.role === "assistant") {
    return {
      role: "assistant",
      status: "completed",
      content: [
        {
          type: "output_text",
          text: entry.content,
        },
      ],
    };
  }

  if (entry.role === "user") {
    return {
      role: "user",
      content: entry.content,
    };
  }

  return null;
}

export async function runAgentWorkflow(params: AgentRunInput) {
  const {
    orgId,
    userId,
    conversationId: requestedConversationId,
    message,
    input,
    dealId,
    jurisdictionId,
    sku,
    runType,
    maxTurns,
    persistConversation = true,
    injectSystemContext = true,
    onEvent,
  } = params;

  if (!message && !(input && input.length > 0)) {
    throw new Error("Either 'message' or 'input' is required.");
  }

  let conversationId = requestedConversationId ?? null;
  let contextDeal: DealContext | null = null;
  let jurisdictionContext: JurisdictionContext | null = null;

  if (dealId) {
    contextDeal = await prisma.deal.findFirst({
      where: { id: dealId, orgId },
      select: {
        id: true,
        name: true,
        status: true,
        sku: true,
        jurisdiction: {
          select: { id: true, name: true, state: true },
        },
      },
    });

    if (!contextDeal) {
      throw new Error("Deal not found or access denied");
    }

    jurisdictionContext = contextDeal.jurisdiction
      ? {
          id: contextDeal.jurisdiction.id,
          name: contextDeal.jurisdiction.name,
          state: contextDeal.jurisdiction.state,
        }
      : null;
  } else if (jurisdictionId) {
    const jurisdiction = await prisma.jurisdiction.findFirst({
      where: { id: jurisdictionId, orgId },
      select: { id: true, name: true, state: true },
    });
    if (!jurisdiction) {
      throw new Error("Jurisdiction not found or access denied");
    }
    jurisdictionContext = jurisdiction;
  }

  if (conversationId) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, orgId },
      select: { id: true },
    });
    if (!conversation) {
      throw new Error("Conversation not found");
    }
  }

  const systemContext = [
    buildSystemContext(orgId, userId, dealId, jurisdictionId, sku),
    buildJurisdictionContext(jurisdictionContext),
    contextDeal
      ? [
          "Current deal context:",
          `Deal: ${contextDeal.name} (${contextDeal.status})`,
          `Deal ID: ${contextDeal.id}`,
          `Jurisdiction: ${contextDeal.jurisdiction?.name ?? "Unknown"}, ${
            contextDeal.jurisdiction?.state ?? "LA"
          }`,
          `SKU: ${contextDeal.sku}`,
        ].join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  let agentInput: AgentInputMessage[];

  const hasInputOverride = input && input.length > 0;

  if (hasInputOverride) {
    agentInput = [...input];
  } else {
    const history = await prisma.message.findMany({
      where: conversationId ? { conversationId } : {},
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    agentInput = history
      .map((entry) =>
        toAgentInputMessage({ role: entry.role, content: entry.content }),
      )
      .filter((entry): entry is AgentInputMessage => entry !== null);

    if (message) {
      agentInput.push({ role: "user", content: message });
    }

    if (persistConversation && message && conversationId) {
      await prisma.message.create({
        data: {
          conversationId,
          role: "user",
          content: message,
        },
      });
    }
  }

  if (!conversationId && persistConversation && (dealId || hasInputOverride || message)) {
    const created = await prisma.conversation.create({
      data: {
        orgId,
        userId,
        dealId: contextDeal?.id ?? dealId ?? null,
        title: message ? message.slice(0, 100) : "Agent run",
      },
      select: { id: true },
    });
    conversationId = created.id;

    if (persistConversation && message && !hasInputOverride) {
      await prisma.message.create({
        data: {
          conversationId,
          role: "user",
          content: message,
        },
      });
    }
  }

  if (injectSystemContext && agentInput.length > 0 && agentInput[0].role === "user") {
    agentInput[0] = {
      ...agentInput[0],
      content: `${systemContext}\n\n${agentInput[0].content}`,
    };
  }

  const result = await executeAgentWorkflow({
    orgId,
    userId,
    conversationId: conversationId ?? "agent-run",
    input: agentInput,
    runType,
    maxTurns,
    dealId: dealId ?? undefined,
    jurisdictionId: jurisdictionId ?? undefined,
    sku: sku ?? undefined,
    onEvent,
  });

  if (persistConversation && conversationId && result.finalOutput.length > 0) {
    await prisma.message.create({
      data: {
        conversationId,
        role: "assistant",
        content: result.finalOutput,
      },
    });
  }

  return {
    result,
    conversationId,
    agentInput,
  };
}
