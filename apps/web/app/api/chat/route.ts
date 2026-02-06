import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { prisma } from "@entitlement-os/db";

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * Resolve Supabase auth from request cookies.
 * Returns the authenticated user ID and their org ID, or null if unauthenticated.
 */
async function resolveAuth() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";

  if (!supabaseUrl || !supabaseAnonKey) return null;

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        cookieStore.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        cookieStore.set({ name, value: "", ...options });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Look up org membership for this user
  const membership = await prisma.orgMembership.findFirst({
    where: { userId: user.id },
    select: { orgId: true },
  });

  if (!membership) return null;

  return { userId: user.id, orgId: membership.orgId };
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
    // Verify the conversation belongs to this org
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

  // --- Build input for agent ---
  const input = history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  if (dealContext) {
    // Prepend deal context as a system-like message in the first user turn
    const firstUser = input.find((m) => m.role === "user");
    if (firstUser && input.indexOf(firstUser) === 0) {
      firstUser.content = dealContext + "\n\n" + firstUser.content;
    }
  }

  // --- Stream SSE response ---
  const encoder = new TextEncoder();
  const finalConvId = convId;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // TODO: Replace placeholder with real agent streaming once
        // @entitlement-os/openai coordinator + run() are wired up.
        //
        // Real implementation will look like:
        //   import { coordinatorAgent } from '@entitlement-os/openai/agents/coordinator';
        //   import { run } from '@openai/agents';
        //   const result = run(coordinatorAgent, input);
        //   for await (const event of result) { ... }

        controller.enqueue(
          encoder.encode(
            sseEvent({ type: "agent_switch", agentName: "Coordinator" }),
          ),
        );

        // Placeholder response — echoes back acknowledgment
        const placeholderText =
          "I understand your request. The agent system is being connected — " +
          "once integrated, I will route your query to the appropriate specialist agent " +
          "(Research, Finance, Legal, Entitlements, etc.) and stream back results in real time.";

        // Simulate token-by-token streaming by splitting on words
        const words = placeholderText.split(" ");
        for (let i = 0; i < words.length; i++) {
          const chunk = (i > 0 ? " " : "") + words[i];
          controller.enqueue(
            encoder.encode(sseEvent({ type: "text_delta", content: chunk })),
          );
        }

        controller.enqueue(
          encoder.encode(
            sseEvent({ type: "done", conversationId: finalConvId }),
          ),
        );

        // Persist assistant message
        await prisma.message.create({
          data: {
            conversationId: finalConvId,
            role: "assistant",
            content: placeholderText,
            agentName: "Coordinator",
          },
        });

        controller.close();
      } catch (error) {
        const errMsg =
          error instanceof Error ? error.message : "Internal error";
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
