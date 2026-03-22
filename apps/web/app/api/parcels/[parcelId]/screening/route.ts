import "server-only";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { checkRateLimit } from "@/lib/server/rateLimiter";
import {
  getCloudflareAccessHeadersFromEnv,
  logPropertyDbRuntimeHealth,
} from "@/lib/server/propertyDbEnv";

export const runtime = "nodejs";

const SCREENING_TIMEOUT_MS = 8_000;

export type ScreeningSummary = {
  parcel_id: string;
  address: string | null;
  in_sfha: boolean;
  flood_zone_count: number;
  flood_zones: unknown[];
  has_hydric: boolean;
  soil_unit_count: number;
  soil_units: unknown[];
  has_wetlands: boolean;
  wetland_count: number;
  wetlands: unknown[];
  epa_facility_count: number;
  epa_facilities: unknown[];
  has_environmental_constraints: boolean;
  has_nearby_epa_facilities: boolean;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ parcelId: string }> },
) {
  const requestId = crypto.randomUUID();

  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json(
        { ok: false, request_id: requestId, error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
        { status: 401 },
      );
    }

    const { parcelId: rawParcelId } = await params;
    const parcelId = decodeURIComponent(rawParcelId).replace(/^ext-/, "").trim();

    if (!parcelId) {
      return NextResponse.json(
        { ok: false, request_id: requestId, error: { code: "BAD_REQUEST", message: "parcelId is required" } },
        { status: 400 },
      );
    }

    if (!checkRateLimit(`screening:${auth.orgId}`, 30, 5)) {
      return NextResponse.json(
        { ok: false, request_id: requestId, error: { code: "RATE_LIMITED", message: "Too many requests" } },
        { status: 429 },
      );
    }

    const gatewayConfig = logPropertyDbRuntimeHealth("/api/parcels/[parcelId]/screening");
    if (!gatewayConfig) {
      return NextResponse.json(
        { ok: false, request_id: requestId, error: { code: "GATEWAY_UNCONFIGURED", message: "Screening provider is unavailable" } },
        { status: 503 },
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SCREENING_TIMEOUT_MS);

    try {
      const url = `${gatewayConfig.url.replace(/\/$/, "")}/api/screening/cached/${encodeURIComponent(parcelId)}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${gatewayConfig.key}`,
          ...getCloudflareAccessHeadersFromEnv(),
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        await res.text().catch(() => "");
        const message =
          res.status === 404
            ? "Parcel not in screening cache"
            : "Gateway error";
        return NextResponse.json(
          { ok: false, request_id: requestId, error: { code: "GATEWAY_ERROR", message } },
          { status: res.status >= 500 ? 502 : res.status },
        );
      }

      const json = (await res.json()) as { ok: boolean; data?: ScreeningSummary };
      const response = NextResponse.json({ ok: true, request_id: requestId, data: json.data });
      response.headers.set("Cache-Control", "private, max-age=300, stale-while-revalidate=3600");
      return response;
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    Sentry.captureException(err, {
      tags: { route: "api.parcels.screening", method: "GET" },
    });
    const message = isTimeout ? "Screening request timed out" : "Internal server error";
    return NextResponse.json(
      { ok: false, request_id: crypto.randomUUID(), error: { code: isTimeout ? "TIMEOUT" : "UPSTREAM_ERROR", message } },
      { status: isTimeout ? 504 : 502 },
    );
  }
}
