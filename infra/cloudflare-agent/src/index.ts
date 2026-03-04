/* ------------------------------------------------------------------
 * Cloudflare Worker entry point for Entitlement OS Agent Chat
 *
 * Handles WebSocket upgrade, validates Supabase JWT, resolves org
 * membership via Vercel, then hands off to the AgentChatDO.
 * ------------------------------------------------------------------ */

import type { Env } from "./types";
import { handleDbProxy } from "./db-proxy";

export { AgentChatDO } from "./durable-object";
export { CodexRelayDO } from "./codex-relay-do";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", worker: "entitlement-os-agent", hyperdrive: !!env.HYPERDRIVE });
    }

    // DB proxy — Prisma SQL queries via Hyperdrive
    if (url.pathname === "/db" && request.method === "POST") {
      return handleDbProxy(request, env);
    }

    // Route /{conversationId}/push to the Durable Object push handler
    // Path format: /abc123/push
    const pushMatch = url.pathname.match(/^\/([^/]+)\/push$/);
    if (pushMatch) {
      const conversationId = pushMatch[1];
      const doId = env.AGENT_CHAT.idFromName(conversationId);
      const stub = env.AGENT_CHAT.get(doId);
      // Forward with /push pathname so DO routes correctly
      const doUrl = new URL(request.url);
      doUrl.pathname = "/push";
      return stub.fetch(new Request(doUrl.toString(), request));
    }

    if (url.pathname === "/codex") {
      const connectionId = url.searchParams.get("connectionId")?.trim();
      if (!connectionId) {
        return new Response("Missing connectionId", { status: 400 });
      }

      const doId = env.CODEX_RELAY.idFromName(connectionId);
      const stub = env.CODEX_RELAY.get(doId);
      const doUrl = new URL(request.url);
      doUrl.pathname = "/codex";
      return stub.fetch(new Request(doUrl.toString(), request));
    }

    // Only accept WebSocket connections on /ws
    if (url.pathname !== "/ws") {
      return new Response("Not found", { status: 404 });
    }

    // --- Auth: resolve org membership via Vercel ---
    // Vercel's resolveAuth() handles both real Supabase JWTs and dev bypass
    // (NEXT_PUBLIC_DISABLE_AUTH=true), so we delegate all auth logic there.
    const token = url.searchParams.get("token") ?? "";
    const conversationId = url.searchParams.get("conversationId");

    if (!conversationId) {
      return new Response("Missing conversationId", { status: 400 });
    }

    const orgRes = await fetch(`${env.VERCEL_URL}/api/agent/auth/resolve`, {
      method: "POST",
      headers: token
        ? { Authorization: `Bearer ${token}` }
        : {},
    });
    if (!orgRes.ok) {
      const body = await orgRes.text().catch(() => "");
      return new Response(`Auth failed: ${body}`, { status: 401 });
    }

    const { orgId, userId } = (await orgRes.json()) as {
      orgId: string;
      userId: string;
    };

    if (!orgId || !userId) {
      return new Response("No org membership found", { status: 403 });
    }

    // --- Route to Durable Object keyed by conversationId ---
    const doId = env.AGENT_CHAT.idFromName(conversationId);
    const stub = env.AGENT_CHAT.get(doId);

    // Forward the request to the DO with auth context in query params
    // (DO is trusted, this is an internal hop)
    const doUrl = new URL(request.url);
    doUrl.pathname = "/ws";
    doUrl.searchParams.set("orgId", orgId);
    doUrl.searchParams.set("userId", userId);
    doUrl.searchParams.set("token", token);
    doUrl.searchParams.set("conversationId", conversationId);

    return stub.fetch(new Request(doUrl.toString(), request));
  },
};
