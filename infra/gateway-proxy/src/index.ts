import { Env } from "./types";
import { validateBearer } from "./auth";
import { proxyToUpstream } from "./upstream";
import { matchRoute } from "./routes";
import { cacheGet, cacheSet, buildCacheKey } from "./cache";
import { validateSyncToken, handleSyncBatch, getSyncStatus, SyncBatch } from "./sync";
import { searchParcelsD1, getParcelD1, getScreeningD1 } from "./d1-search";
import { runHealthCheck, saveHealthCheck } from "./health";

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
    // Support both /admin/sync (legacy) and /sync/push (bypasses /admin/* WAF challenge)
    if ((url.pathname === "/admin/sync" || url.pathname === "/sync/push") && request.method === "POST") {
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

    // Deploy report endpoint
    if (url.pathname === "/admin/deploys/report" && request.method === "POST") {
      if (!validateBearer(request, env)) {
        return jsonResponse({ error: "unauthorized" }, 401);
      }
      if (!env.DB) return jsonResponse({ error: "D1 not configured" }, 500);
      const body = await request.json() as { commit?: string; status?: string; triggered_by?: string };
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare(
        "INSERT INTO deploys (deployed_at, commit_hash, status, triggered_by) VALUES (?, ?, ?, ?)"
      ).bind(now, body.commit ?? "unknown", body.status ?? "unknown", body.triggered_by ?? "unknown").run();
      return jsonResponse({ ok: true });
    }

    // Health check history
    if (url.pathname === "/admin/health/history" && request.method === "GET") {
      if (!env.DB) return jsonResponse({ error: "D1 not configured" }, 500);
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 720);
      const rows = await env.DB.prepare(
        "SELECT * FROM health_checks ORDER BY checked_at DESC LIMIT ?"
      ).bind(limit).all();
      return jsonResponse(rows.results);
    }

    const requestId = crypto.randomUUID();

    // Route matching
    const route = matchRoute(url.pathname, request.method, url.searchParams);
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

    // Generic cache missed — try D1 parcel tables as secondary fallback
    if (env.DB) {
      let d1Result: unknown | null = null;

      if (url.pathname === "/parcels/search") {
        const searchResult = await searchParcelsD1(env.DB, {
          address: url.searchParams.get("address") ?? undefined,
          limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 50,
        });
        if (searchResult) d1Result = searchResult.data;
      } else if (url.pathname.match(/^\/parcels\/[^/]+$/) && request.method === "GET") {
        const parcelId = decodeURIComponent(url.pathname.split("/")[2]);
        d1Result = await getParcelD1(env.DB, parcelId);
      } else if (url.pathname.match(/^\/screening\/[^/]+\/[^/]+$/) && request.method === "GET") {
        const parts = url.pathname.split("/");
        const screenType = parts[2];
        const parcelId = decodeURIComponent(parts[3]);
        d1Result = await getScreeningD1(env.DB, parcelId, screenType);
      }

      if (d1Result) {
        return jsonResponse(
          { data: d1Result, source: "d1-cache", staleness_seconds: null },
          200,
          "d1-cache"
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

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const result = await runHealthCheck(env);

    if (env.DB) {
      ctx.waitUntil(saveHealthCheck(env.DB, result));
    }

    if (!result.gateway_ok) {
      console.error(`[HEALTH ALERT] Gateway DOWN. Action: ${result.action_taken}. Probes: ${JSON.stringify(result.probes)}`);
    }
  },
} satisfies ExportedHandler<Env>;
