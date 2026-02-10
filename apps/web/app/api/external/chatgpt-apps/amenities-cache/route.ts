import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getAmenitiesCache, upsertAmenitiesCache } from "@/lib/server/chatgptAppsClient";
import { checkRateLimit } from "@/lib/server/rateLimiter";

export const runtime = "nodejs";

const ROUTE_KEY = "chatgpt-apps:amenities-cache";

// GET body comes via search params for cache reads
const GetSchema = z.object({
  cacheKey: z.string().min(1),
});

// POST body for cache writes
const PostSchema = z.object({
  cacheKey: z.string().min(1),
  payload: z.record(z.unknown()),
  ttlSeconds: z.number().int().min(1).max(7776000).default(604800),
});

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();

  if (!checkRateLimit(ROUTE_KEY)) {
    return NextResponse.json(
      { ok: false, request_id: requestId, error: { code: "RATE_LIMITED", message: "Too many requests" } },
      { status: 429 },
    );
  }

  const { searchParams } = new URL(request.url);
  const cacheKey = searchParams.get("cacheKey");

  let input: z.infer<typeof GetSchema>;
  try {
    input = GetSchema.parse({ cacheKey });
  } catch (err) {
    const message = err instanceof ZodError
      ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
      : "Invalid input";
    return NextResponse.json(
      { ok: false, request_id: requestId, error: { code: "BAD_REQUEST", message } },
      { status: 400 },
    );
  }

  const result = await getAmenitiesCache(input.cacheKey, requestId);

  if (!result.ok) {
    const status = result.status === 429 ? 429 : 502;
    return NextResponse.json(
      { ok: false, request_id: result.requestId, error: { code: "UPSTREAM_ERROR", message: result.error } },
      { status },
    );
  }

  return NextResponse.json({ ok: true, request_id: result.requestId, data: result.data });
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  if (!checkRateLimit(ROUTE_KEY)) {
    return NextResponse.json(
      { ok: false, request_id: requestId, error: { code: "RATE_LIMITED", message: "Too many requests" } },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
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

  const result = await upsertAmenitiesCache(
    input.cacheKey,
    input.payload as Record<string, unknown>,
    input.ttlSeconds,
    requestId,
  );

  if (!result.ok) {
    const status = result.status === 429 ? 429 : 502;
    return NextResponse.json(
      { ok: false, request_id: result.requestId, error: { code: "UPSTREAM_ERROR", message: result.error } },
      { status },
    );
  }

  return NextResponse.json({ ok: true, request_id: result.requestId, data: result.data });
}
