import "server-only";
import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { authorizeApiRoute } from "@/lib/auth/authorizeApiRoute";
import { getPropertyDbScopeHeaders } from "@/lib/server/propertyDbRpc";
import { checkRateLimit } from "@/lib/server/rateLimiter";
import {
  getCloudflareAccessHeadersFromEnv,
  logPropertyDbRuntimeHealth,
} from "@/lib/server/propertyDbEnv";

export const runtime = "nodejs";

const SCREENING_TIMEOUT_MS = 12_000;

export type ScreeningSummary = {
  parcel_id: string;
  address: string | null;
  in_sfha: boolean;
  flood_zone_count: number;
  has_hydric: boolean;
  soil_unit_count: number;
  has_wetlands: boolean;
  wetland_count: number;
  epa_facility_count: number;
  has_environmental_constraints: boolean;
  has_nearby_epa_facilities: boolean;
};

/**
 * Screening query executed via the gateway's parcels.sql endpoint.
 * Uses correlated subqueries against the property DB screening tables.
 */
function buildScreeningSQL(parcelId: string): string {
  const escaped = parcelId.replace(/'/g, "''");
  return [
    "SELECT p.parcel_id, p.address,",
    "  (SELECT count(*) FROM fema_flood f WHERE ST_Intersects(f.geom, p.geom))::int AS flood_zone_count,",
    `  (SELECT coalesce(bool_or(f.zone IN ('A','AE','AH','AO','V','VE')), false) FROM fema_flood f WHERE ST_Intersects(f.geom, p.geom)) AS in_sfha,`,
    "  (SELECT count(*) FROM soils s WHERE ST_Intersects(s.geom, p.geom))::int AS soil_unit_count,",
    `  (SELECT coalesce(bool_or(s.hydric_rating = 'Yes'), false) FROM soils s WHERE ST_Intersects(s.geom, p.geom)) AS has_hydric,`,
    "  (SELECT count(*) FROM wetlands w WHERE ST_Intersects(w.geom, p.geom))::int AS wetland_count,",
    "  (SELECT count(*) > 0 FROM wetlands w WHERE ST_Intersects(w.geom, p.geom)) AS has_wetlands,",
    "  (SELECT count(*) FROM epa_facilities e WHERE ST_DWithin(e.geom::geography, ST_Centroid(p.geom)::geography, 1609.34))::int AS epa_1mi",
    "FROM ebr_parcels p",
    `WHERE p.parcel_id = '${escaped}'`,
    `  OR lower(p.parcel_id) = lower('${escaped}')`,
    `  OR replace(p.parcel_id, '-', '') = replace('${escaped}', '-', '')`,
    "LIMIT 1",
  ].join(" ");
}

type GatewayRow = {
  parcel_id: string;
  address: string | null;
  flood_zone_count: number;
  in_sfha: boolean | null;
  soil_unit_count: number;
  has_hydric: boolean | null;
  wetland_count: number;
  has_wetlands: boolean;
  epa_1mi: number;
};

type ParcelLookupGatewayRecord = {
  parcel_uid?: string | null;
  parcel_id?: string | null;
};

async function resolveCanonicalScreeningParcelId(params: {
  gatewayUrl: string;
  gatewayKey: string;
  parcelId: string;
  signal: AbortSignal;
}): Promise<string> {
  const res = await fetch(`${params.gatewayUrl}/tools/parcel.lookup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.gatewayKey}`,
      ...getPropertyDbScopeHeaders("parcels.read"),
      ...getCloudflareAccessHeadersFromEnv(),
    },
    body: JSON.stringify({ parcel_id: params.parcelId }),
    signal: params.signal,
  });

  if (!res.ok) {
    return params.parcelId;
  }

  let json: { ok?: boolean; data?: ParcelLookupGatewayRecord | null };
  try {
    json = (await res.json()) as { ok?: boolean; data?: ParcelLookupGatewayRecord | null };
  } catch {
    return params.parcelId;
  }

  const canonicalParcelId =
    json.ok === true
      ? json.data?.parcel_uid?.trim() || json.data?.parcel_id?.trim() || ""
      : "";

  return canonicalParcelId.length > 0 ? canonicalParcelId : params.parcelId;
}

function mapRowToSummary(row: GatewayRow): ScreeningSummary {
  const inSfha = row.in_sfha === true;
  const hasHydric = row.has_hydric === true;
  const hasWetlands = row.has_wetlands === true;
  const epaCount = row.epa_1mi ?? 0;

  return {
    parcel_id: row.parcel_id,
    address: row.address,
    in_sfha: inSfha,
    flood_zone_count: row.flood_zone_count ?? 0,
    has_hydric: hasHydric,
    soil_unit_count: row.soil_unit_count ?? 0,
    has_wetlands: hasWetlands,
    wetland_count: row.wetland_count ?? 0,
    epa_facility_count: epaCount,
    has_environmental_constraints: inSfha || hasHydric || hasWetlands,
    has_nearby_epa_facilities: epaCount > 0,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ parcelId: string }> },
) {
  const requestId = crypto.randomUUID();

  try {
    const authorization = await authorizeApiRoute(
      request,
      "/api/parcels/[parcelId]/screening",
    );
    if (!authorization.ok || !authorization.auth) {
      if (authorization.ok || authorization.response.status === 401) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "UNAUTHORIZED",
              message: "Unauthorized",
            },
            requestId,
          },
          { status: 401 },
        );
      }
      return authorization.response;
    }
    const auth = authorization.auth;

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
      const gatewayUrl = gatewayConfig.url.replace(/\/$/, "");
      const screeningParcelId = await resolveCanonicalScreeningParcelId({
        gatewayUrl,
        gatewayKey: gatewayConfig.key,
        parcelId,
        signal: controller.signal,
      });
      const sql = buildScreeningSQL(screeningParcelId);
      const res = await fetch(`${gatewayUrl}/tools/parcels.sql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${gatewayConfig.key}`,
          ...getPropertyDbScopeHeaders("parcels.read"),
          ...getCloudflareAccessHeadersFromEnv(),
        },
        body: JSON.stringify({ sql }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.warn("[screening] gateway error:", { parcelId, status: res.status, body: text.slice(0, 200) });
        return NextResponse.json(
          { ok: false, request_id: requestId, error: { code: "GATEWAY_ERROR", message: "Screening query failed" } },
          { status: res.status >= 500 ? 502 : res.status },
        );
      }

      const json = (await res.json()) as { ok: boolean; rows?: GatewayRow[]; error?: string };
      if (!json.ok || !json.rows?.length) {
        return NextResponse.json(
          { ok: false, request_id: requestId, error: { code: "NOT_FOUND", message: json.error ?? "Parcel not found in screening database" } },
          { status: 404 },
        );
      }

      const summary = mapRowToSummary(json.rows[0]);
      const response = NextResponse.json({ ok: true, request_id: requestId, data: summary });
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
      { ok: false, request_id: requestId, error: { code: isTimeout ? "TIMEOUT" : "UPSTREAM_ERROR", message } },
      { status: isTimeout ? 504 : 502 },
    );
  }
}
