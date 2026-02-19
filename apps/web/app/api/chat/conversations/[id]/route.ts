import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { prisma } from "@entitlement-os/db";
import { resolveSupabaseAnonKey, resolveSupabaseUrl } from "@/lib/db/supabaseEnv";

async function resolveAuth() {
  const supabaseUrl = resolveSupabaseUrl() ?? "";
  const supabaseAnonKey = resolveSupabaseAnonKey() ?? "";

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

  const membership = await prisma.orgMembership.findFirst({
    where: { userId: user.id },
    select: { orgId: true },
  });

  if (!membership) return null;

  return { userId: user.id, orgId: membership.orgId };
}

// GET /api/chat/conversations/[id] — get a conversation with all messages
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const conversation = await prisma.conversation.findFirst({
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
          createdAt: true,
        },
      },
      deal: {
        select: { id: true, name: true, status: true },
      },
    },
  });

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
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
      messages: conversation.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        agentName: m.agentName,
        toolCalls: m.toolCalls,
        createdAt: m.createdAt.toISOString(),
      })),
    },
  });
}

// DELETE /api/chat/conversations/[id] — delete a conversation
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify ownership before deleting
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

  // Cascade delete will remove messages via Prisma relation
  await prisma.conversation.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
