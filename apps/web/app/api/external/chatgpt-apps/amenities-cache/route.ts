import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  getAmenitiesCache,
  toOrgScopedCacheKey,
  upsertAmenitiesCache,
} from "@/lib/server/chatgptAppsClient";
import { checkRateLimit } from "@/lib/server/rateLimiter";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { captureChatGptAppsError } from "@/lib/automation/sentry";

export const runtime = "nodejs";

const ROUTE_KEY = "chatgpt-apps:amenities-cache";
const MAX_JSON_BODY_BYTES = 300_000;

// GET body comes via search params for cache reads
const GetSchema = z.object({
  cacheKey: z.string().min(1),
});

// POST body for cache writes
const PostSchema = z.object({
  cacheKey: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  ttlSeconds: z.number().int().min(1).max(7776000).default(604800),
});

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();

  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json(
      { ok: false, request_id: requestId, error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
      { status: 401 },
    );
  }

  if (!checkRateLimit(`${ROUTE_KEY}:${auth.orgId}`)) {
    return NextResponse.json(
      { ok: false, request_id: requestId, error: { code: "RATE_LIMITED", message: "Too many requests" } },
      { status: 429 },
    );
  }

  const { searchParams } = new URL(request.url);
  const rawCacheKey = searchParams.get("cacheKey");

  let input: z.infer<typeof GetSchema>;
  try {
    input = GetSchema.parse({ cacheKey: rawCacheKey });
  } catch (err) {
    const message = err instanceof ZodError
      ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
      : "Invalid input";
    return NextResponse.json(
      { ok: false, request_id: requestId, error: { code: "BAD_REQUEST", message } },
      { status: 400 },
    );
  }

  let result: Awaited<ReturnType<typeof getAmenitiesCache>>;
  const cacheKey = toOrgScopedCacheKey(auth.orgId, input.cacheKey);
  try {
    result = await getAmenitiesCache(cacheKey, requestId);
  } catch (error) {
    captureChatGptAppsError(error, {
      rpc: "getAmenitiesCache",
      requestId,
      orgId: auth.orgId,
      route: "/api/external/chatgpt-apps/amenities-cache",
      input: { cacheKey },
    });
    return NextResponse.json(
      { ok: false, request_id: requestId, error: { code: "UPSTREAM_ERROR", message: "Upstream request failed" } },
      { status: 502 },
    );
  }

  if (!result.ok) {
    captureChatGptAppsError(new Error(result.error), {
      rpc: "getAmenitiesCache",
      requestId: result.requestId,
      orgId: auth.orgId,
      route: "/api/external/chatgpt-apps/amenities-cache",
      status: result.status,
      input: { cacheKey },
      details: result.error,
    });
    const status =
      typeof result.status === "number" && result.status >= 400 && result.status <= 599
        ? result.status
        : 502;
    return NextResponse.json(
      {
        ok: false,
        request_id: result.requestId,
        error: { code: "UPSTREAM_ERROR", message: "Upstream request failed" },
      },
      { status },
    );
  }

  return NextResponse.json({ ok: true, request_id: result.requestId, data: result.data });
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json(
      { ok: false, request_id: requestId, error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
      { status: 401 },
    );
  }

  if (!checkRateLimit(`${ROUTE_KEY}:${auth.orgId}`)) {
    return NextResponse.json(
      { ok: false, request_id: requestId, error: { code: "RATE_LIMITED", message: "Too many requests" } },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_JSON_BODY_BYTES) {
      return NextResponse.json(
        { ok: false, request_id: requestId, error: { code: "PAYLOAD_TOO_LARGE", message: "Request body too large" } },
        { status: 413 },
      );
    }

    const text = await request.text();
    if (text.length > MAX_JSON_BODY_BYTES) {
      return NextResponse.json(
        { ok: false, request_id: requestId, error: { code: "PAYLOAD_TOO_LARGE", message: "Request body too large" } },
        { status: 413 },
      );
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { ok: false, request_id: requestId, error: { code: "BAD_REQUEST", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  let input: z.infer<typeof PostSchema>;
  try {
    input = PostSchema.parse(body);
  } catch (err) {
    const message = err instanceof ZodError
      ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
      : "Invalid input";
    return NextResponse.json(
      { ok: false, request_id: requestId, error: { code: "BAD_REQUEST", message } },
      { status: 400 },
    );
  }

  let result: Awaited<ReturnType<typeof upsertAmenitiesCache>>;
  const cacheKey = toOrgScopedCacheKey(auth.orgId, input.cacheKey);
  try {
    result = await upsertAmenitiesCache(
      cacheKey,
      input.payload as Record<string, unknown>,
      input.ttlSeconds,
      requestId,
    );
  } catch (error) {
    captureChatGptAppsError(error, {
      rpc: "upsertAmenitiesCache",
      requestId,
      orgId: auth.orgId,
      route: "/api/external/chatgpt-apps/amenities-cache",
      input: { cacheKey, ttlSeconds: input.ttlSeconds },
    });
    return NextResponse.json(
      { ok: false, request_id: requestId, error: { code: "UPSTREAM_ERROR", message: "Upstream request failed" } },
      { status: 502 },
    );
  }

  if (!result.ok) {
    captureChatGptAppsError(new Error(result.error), {
      rpc: "upsertAmenitiesCache",
      requestId: result.requestId,
      orgId: auth.orgId,
      route: "/api/external/chatgpt-apps/amenities-cache",
      status: result.status,
      input: { cacheKey, ttlSeconds: input.ttlSeconds },
      details: result.error,
    });
    const status =
      typeof result.status === "number" && result.status >= 400 && result.status <= 599
        ? result.status
        : 502;
    return NextResponse.json(
      {
        ok: false,
        request_id: result.requestId,
        error: { code: "UPSTREAM_ERROR", message: "Upstream request failed" },
      },
      { status },
    );
  }

  return NextResponse.json({ ok: true, request_id: result.requestId, data: result.data });
}
