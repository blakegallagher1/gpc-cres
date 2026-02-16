import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getZoningByPoint } from "@/lib/server/chatgptAppsClient";
import { checkRateLimit } from "@/lib/server/rateLimiter";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { captureChatGptAppsError } from "@/lib/automation/sentry";

export const runtime = "nodejs";

const ROUTE_KEY = "chatgpt-apps:zoning-by-point";
const MAX_JSON_BODY_BYTES = 20_000;

const BodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  parish: z.string().min(1).nullable().optional(),
});

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

  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_JSON_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, request_id: requestId, error: { code: "PAYLOAD_TOO_LARGE", message: "Request body too large" } },
      { status: 413 },
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

  let input: z.infer<typeof BodySchema>;
  try {
    input = BodySchema.parse(body);
  } catch (err) {
    const message = err instanceof ZodError
      ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
      : "Invalid input";
    return NextResponse.json(
      { ok: false, request_id: requestId, error: { code: "BAD_REQUEST", message } },
      { status: 400 },
    );
  }

  let result: Awaited<ReturnType<typeof getZoningByPoint>>;
  try {
    result = await getZoningByPoint(input.lat, input.lng, input.parish ?? null, requestId);
  } catch (error) {
    captureChatGptAppsError(error, {
      rpc: "getZoningByPoint",
      requestId,
      orgId: auth.orgId,
      route: "/api/external/chatgpt-apps/zoning-by-point",
      input: { lat: input.lat, lng: input.lng, parish: input.parish ?? null },
    });
    return NextResponse.json(
      { ok: false, request_id: requestId, error: { code: "UPSTREAM_ERROR", message: "Upstream request failed" } },
      { status: 502 },
    );
  }

  if (!result.ok) {
    captureChatGptAppsError(new Error(result.error), {
      rpc: "getZoningByPoint",
      requestId: result.requestId,
      orgId: auth.orgId,
      route: "/api/external/chatgpt-apps/zoning-by-point",
      status: result.status,
      input: { lat: input.lat, lng: input.lng, parish: input.parish ?? null },
      details: result.error,
    });
    const status = result.status === 429 ? 429 : result.status === 504 ? 504 : 502;
    return NextResponse.json(
      { ok: false, request_id: result.requestId, error: { code: "UPSTREAM_ERROR", message: result.error } },
      { status },
    );
  }

  return NextResponse.json({ ok: true, request_id: result.requestId, data: result.data });
}
