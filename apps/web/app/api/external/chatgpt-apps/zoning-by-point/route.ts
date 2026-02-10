import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getZoningByPoint } from "@/lib/server/chatgptAppsClient";
import { checkRateLimit } from "@/lib/server/rateLimiter";

export const runtime = "nodejs";

const ROUTE_KEY = "chatgpt-apps:zoning-by-point";

const BodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  parish: z.string().min(1).nullable().optional(),
});

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

  const result = await getZoningByPoint(input.lat, input.lng, input.parish ?? null, requestId);

  if (!result.ok) {
    const status = result.status === 429 ? 429 : result.status === 504 ? 504 : 502;
    return NextResponse.json(
      { ok: false, request_id: result.requestId, error: { code: "UPSTREAM_ERROR", message: result.error } },
      { status },
    );
  }

  return NextResponse.json({ ok: true, request_id: result.requestId, data: result.data });
}
