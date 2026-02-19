import { NextResponse } from "next/server";
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

// GET /api/chat/conversations — list conversations for the current user's org
export async function GET() {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
}
