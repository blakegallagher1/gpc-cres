import { Env } from "./types";
import { validateBearer } from "./auth";
import { proxyToUpstream } from "./upstream";
import { matchRoute } from "./routes";
import { cacheGet, cacheSet, buildCacheKey } from "./cache";
import { validateSyncToken, handleSyncBatch, getSyncStatus, SyncBatch } from "./sync";

function jsonResponse(body: unknown, status = 200, source = "gateway"): Response {
  return Response.json(body, {
    status,
    headers: {
      "X-GPC-Source": source,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        },
      });
    }

    const url = new URL(request.url);

    // Health check — no auth
    if (url.pathname === "/health") {
      return jsonResponse({ status: "ok", service: "gpc-gateway-proxy" });
    }

    // Sync endpoints — separate auth via X-Sync-Token
    if (url.pathname === "/admin/sync" && request.method === "POST") {
      if (!validateSyncToken(request, env)) {
        return jsonResponse({ error: "unauthorized" }, 401);
      }
      if (!env.DB) {
        return jsonResponse({ error: "D1 not configured" }, 500);
      }
      const batch = await request.json() as SyncBatch;
      const syncResult = await handleSyncBatch(env.DB, batch);
      return jsonResponse({ ok: true, ...syncResult });
    }

    // Auth check (all other routes)
    if (!validateBearer(request, env)) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    // Sync status — uses Bearer auth
    if (url.pathname === "/admin/sync/status" && request.method === "GET") {
      if (!env.DB) {
        return jsonResponse({ error: "D1 not configured" }, 500);
      }
      const status = await getSyncStatus(env.DB);
      return jsonResponse(status);
    }

    const requestId = crypto.randomUUID();

    // Route matching
    const route = matchRoute(url.pathname, request.method);
    if (!route) {
      return jsonResponse({ error: "not found" }, 404);
    }

    // Build upstream body
    let body: unknown;
    if (request.method === "POST") {
      body = await request.json().catch(() => ({}));
    } else if (route.buildBody) {
      body = route.buildBody(url.searchParams);
    }

    const result = await proxyToUpstream(env, route.upstreamMethod, route.upstreamPath, body, requestId);

    if (result.ok) {
      // Cache the successful response in D1 (fire-and-forget)
      if (env.DB) {
        const cacheKey = buildCacheKey(url.pathname, url.searchParams);
        ctx.waitUntil(cacheSet(env.DB, cacheKey, result.data));
      }
      return jsonResponse(
        { data: result.data, source: "gateway", staleness_seconds: null },
        200,
        "gateway"
      );
    }

    // Upstream failed — try D1 cache fallback
    if (env.DB) {
      const cacheKey = buildCacheKey(url.pathname, url.searchParams);
      const cached = await cacheGet(env.DB, cacheKey);
      if (cached) {
        return jsonResponse(
          { data: cached.data, source: cached.source, staleness_seconds: cached.staleness_seconds },
          200,
          cached.source
        );
      }
    }

    // No cache available
    return jsonResponse(
      { data: null, source: "gateway", staleness_seconds: null, error: "upstream unavailable, no cache" },
      502,
      "gateway"
    );
  },
} satisfies ExportedHandler<Env>;
