import { Env } from "./types";
import { validateBearer } from "./auth";
import { proxyToUpstream } from "./upstream";
import { matchRoute } from "./routes";

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

    // Auth check
    if (!validateBearer(request, env)) {
      return jsonResponse({ error: "unauthorized" }, 401);
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
      return jsonResponse(
        { data: result.data, source: "gateway", staleness_seconds: null },
        200,
        "gateway"
      );
    }

    // Pass-through mode — no D1 fallback yet
    return jsonResponse(
      { data: null, source: "gateway", staleness_seconds: null, error: "upstream unavailable" },
      502,
      "gateway"
    );
  },
} satisfies ExportedHandler<Env>;
