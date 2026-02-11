import { NextRequest } from "next/server";
import { prisma } from "@entitlement-os/db";
import { buildAgentStreamRunOptions, createConfiguredCoordinator } from "@entitlement-os/openai";
import { run } from "@openai/agents";
import { resolveAuth } from "@/lib/auth/resolveAuth";

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  // --- Parse body ---
  let body: { message?: string; conversationId?: string; dealId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { message, conversationId, dealId } = body;
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  // --- Auth ---
  const auth = await resolveAuth();
  if (!auth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId, orgId } = auth;

  // --- Get or create conversation ---
  let convId = conversationId;
  if (convId) {
    const existing = await prisma.conversation.findFirst({
      where: { id: convId, orgId },
      select: { id: true },
    });
    if (!existing) {
      return Response.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }
  } else {
    const conv = await prisma.conversation.create({
      data: {
        orgId,
        userId,
        dealId: dealId || null,
        title: message.substring(0, 100),
      },
    });
    convId = conv.id;
  }

  // --- Store user message ---
  await prisma.message.create({
    data: {
      conversationId: convId,
      role: "user",
      content: message,
    },
  });

  // --- Build conversation history ---
  const history = await prisma.message.findMany({
    where: { conversationId: convId },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  // --- Optionally inject deal context ---
  let dealContext = "";
  if (dealId) {
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, orgId },
      include: { parcels: true, jurisdiction: true },
    });
    if (deal) {
      dealContext = `\n\nCurrent deal context:\nDeal: ${deal.name} (${deal.status})\nJurisdiction: ${deal.jurisdiction.name}, ${deal.jurisdiction.state}\nSKU: ${deal.sku}\nParcels: ${deal.parcels.map((p) => p.address).join("; ")}`;
    }
  }

  // --- Build input for agent SDK ---
  // The @openai/agents SDK expects AgentInputItem[] with protocol-specific shapes.
  // User messages: { role: "user", content: string }
  // Assistant messages: { role: "assistant", status: "completed", content: [{ type: "output_text", text: string }] }
  type UserItem = { role: "user"; content: string };
  type AssistantItem = {
    role: "assistant";
    status: "completed";
    content: Array<{ type: "output_text"; text: string }>;
  };
  type AgentInput = UserItem | AssistantItem;

  const input: AgentInput[] = history.map((m) => {
    if (m.role === "assistant") {
      return {
        role: "assistant" as const,
        status: "completed" as const,
        content: [{ type: "output_text" as const, text: m.content }],
      };
    }
    return { role: "user" as const, content: m.content };
  });

  // Inject system context (orgId, userId, and optional deal) so the agent can call tools
  const systemContext = [
    `[System context — use these values when calling tools]`,
    `orgId: ${orgId}`,
    `userId: ${userId}`,
    dealContext,
  ]
    .filter(Boolean)
    .join("\n");

  if (input.length > 0 && input[0].role === "user") {
    input[0] = { ...input[0], content: systemContext + "\n\n" + input[0].content };
  }

  // --- Stream SSE response ---
  const encoder = new TextEncoder();
  const finalConvId = convId;

  const stream = new ReadableStream({
    async start(controller) {
      let fullText = "";
      let lastAgentName = "Coordinator";

      try {
        // Check for OpenAI API key
        if (!process.env.OPENAI_API_KEY) {
          controller.enqueue(
            encoder.encode(
              sseEvent({
                type: "error",
                message: "OPENAI_API_KEY is not configured on the server.",
              }),
            ),
          );
          controller.close();
          return;
        }

        // Create coordinator with all specialist handoffs
        const coordinator = createConfiguredCoordinator();

        // Run the agent with streaming
        const result = await run(
          coordinator,
          input,
          buildAgentStreamRunOptions({ conversationId: finalConvId, maxTurns: 15 }),
        );

        // Emit initial agent
        controller.enqueue(
          encoder.encode(
            sseEvent({ type: "agent_switch", agentName: "Coordinator" }),
          ),
        );

        // Process streaming events
        for await (const event of result) {
          if (event.type === "agent_updated_stream_event") {
            // Agent handoff occurred
            lastAgentName = event.agent.name;
            controller.enqueue(
              encoder.encode(
                sseEvent({
                  type: "agent_switch",
                  agentName: event.agent.name,
                }),
              ),
            );
          } else if (event.type === "raw_model_stream_event") {
            // Raw model event — check for text delta
            const data = event.data as Record<string, unknown>;
            if (data.type === "output_text_delta" && typeof data.delta === "string") {
              fullText += data.delta;
              controller.enqueue(
                encoder.encode(
                  sseEvent({ type: "text_delta", content: data.delta }),
                ),
              );
            }
          }
        }

        // If no text was streamed (e.g. the agent only did tool calls),
        // extract finalOutput
        if (!fullText && result.finalOutput) {
          const output =
            typeof result.finalOutput === "string"
              ? result.finalOutput
              : JSON.stringify(result.finalOutput);
          fullText = output;
          controller.enqueue(
            encoder.encode(sseEvent({ type: "text_delta", content: output })),
          );
        }

        controller.enqueue(
          encoder.encode(
            sseEvent({ type: "done", conversationId: finalConvId }),
          ),
        );

        // Persist assistant message
        if (fullText) {
          await prisma.message.create({
            data: {
              conversationId: finalConvId,
              role: "assistant",
              content: fullText,
              agentName: lastAgentName,
            },
          });
        }

        controller.close();
      } catch (error) {
        const errMsg =
          error instanceof Error ? error.message : "Internal error";
        console.error("Chat agent error:", error);

        // Still persist what we have
        if (fullText) {
          await prisma.message
            .create({
              data: {
                conversationId: finalConvId,
                role: "assistant",
                content: fullText,
                agentName: lastAgentName,
              },
            })
            .catch(() => {});
        }

        controller.enqueue(
          encoder.encode(sseEvent({ type: "error", message: errMsg })),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
