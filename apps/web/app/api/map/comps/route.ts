import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  authorizeApiRoute,
  type RouteAuthorizationSuccess,
} from "@/lib/auth/authorizeApiRoute";
import { getPropertyDbScopeHeaders } from "@/lib/server/propertyDbRpc";
import {
  attachRequestIdHeader,
  createRequestObservabilityContext,
  logRequestOutcome,
  logRequestStart,
} from "@/lib/server/observability";
import { getCloudflareAccessHeadersFromEnv } from "@/lib/server/propertyDbEnv";
import * as Sentry from "@sentry/nextjs";

const DEFAULT_GATEWAY_TIMEOUT_MS = 6_000;

function getGatewayTimeoutMs(): number {
  const raw = Number(process.env.PROPERTY_DB_GATEWAY_TIMEOUT_MS ?? "");
  if (Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  return DEFAULT_GATEWAY_TIMEOUT_MS;
}

function getGatewayConfig(): { url: string; key: string } | null {
  const url = process.env.LOCAL_API_URL?.trim();
  const key = process.env.LOCAL_API_KEY?.trim();
  if (!url || !key) return null;
  return { url, key };
}

class GatewayConfigError extends Error {
  status: number;
  code: "GATEWAY_UNCONFIGURED";
  constructor(message: string) {
    super(message);
    this.name = "GatewayConfigError";
    this.status = 503;
    this.code = "GATEWAY_UNCONFIGURED";
  }
}

class GatewayUnavailableError extends Error {
  status: number;
  code: "GATEWAY_UNAVAILABLE";
  constructor(message: string, status: number = 503) {
    super(message);
    this.name = "GatewayUnavailableError";
    this.status = status;
    this.code = "GATEWAY_UNAVAILABLE";
  }
}

function ensureGatewayConfig(): { url: string; key: string } {
  const config = getGatewayConfig();
  if (!config) {
    throw new GatewayConfigError("Property database gateway is not configured");
  }
  return config;
}

async function propertyRpc(
  fnName: string,
  body: Record<string, unknown>,
  requestId?: string,
): Promise<unknown> {
  const { url, key } = ensureGatewayConfig();
  if (fnName === "api_search_parcels") {
    const q = String(body.search_text ?? body.p_search_text ?? "").trim();
    const parish = String(body.parish ?? body.p_parish ?? "").trim();
    const limit = Number(body.limit_rows ?? body.p_limit ?? 50);
    if (!q) return [];

    const params = new URLSearchParams({
      q,
      limit: String(Number.isFinite(limit) ? Math.max(1, Math.min(100, limit)) : 50),
    });
    if (parish) {
      params.set("parish", parish);
    }

    let res: Response;
    const timeoutMs = getGatewayTimeoutMs();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      res = await fetch(`${url}/api/parcels/search?${params.toString()}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${key}`,
          ...getPropertyDbScopeHeaders("map.read"),
          ...(requestId ? { "x-request-id": requestId } : {}),
          ...getCloudflareAccessHeadersFromEnv(),
        },
        signal: controller.signal,
      });
    } catch (error) {
      Sentry.captureException(error, {
        tags: { route: "api.map.comps", method: "UNKNOWN" },
      });
      const reason =
        error instanceof Error && error.name === "AbortError"
          ? `request timed out after ${timeoutMs}ms`
          : error instanceof Error
            ? error.message
            : String(error);
      throw new GatewayUnavailableError(
        `[api_search_parcels] request failed: ${reason}`
      );
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new GatewayUnavailableError(
        `[api_search_parcels] upstream ${res.status}: ${text.slice(0, 200)}`,
        res.status >= 500 ? 502 : 503
      );
    }
    try {
      const payload = (await res.json()) as {
        data?: unknown[];
        parcels?: unknown[];
      };
      if (Array.isArray(payload.data)) return payload.data;
      if (Array.isArray(payload.parcels)) return payload.parcels;
      throw new GatewayUnavailableError(
        `[api_search_parcels] invalid payload shape`
      );
    } catch (error) {
      Sentry.captureException(error, {
        tags: { route: "api.map.comps", method: "UNKNOWN" },
      });
      const reason = error instanceof Error ? error.message : String(error);
      throw new GatewayUnavailableError(
        `[api_search_parcels] invalid JSON: ${reason}`
      );
    }
  }

  if (fnName === "api_search_parcels_point") {
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const limit = Number(body.limit ?? 100);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

    let res: Response;
    const timeoutMs = getGatewayTimeoutMs();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      res = await fetch(`${url}/tools/parcel.point`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          ...getPropertyDbScopeHeaders("map.read"),
          ...(requestId ? { "x-request-id": requestId } : {}),
          ...getCloudflareAccessHeadersFromEnv(),
        },
        body: JSON.stringify({
          lat,
          lng,
          limit: Number.isFinite(limit) ? Math.max(1, Math.min(100, limit)) : 100,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      Sentry.captureException(error, {
        tags: { route: "api.map.comps", method: "UNKNOWN" },
      });
      const reason =
        error instanceof Error && error.name === "AbortError"
          ? `request timed out after ${timeoutMs}ms`
          : error instanceof Error
            ? error.message
            : String(error);
      throw new GatewayUnavailableError(
        `[api_search_parcels_point] request failed: ${reason}`
      );
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new GatewayUnavailableError(
        `[api_search_parcels_point] upstream ${res.status}: ${text.slice(0, 200)}`,
        res.status >= 500 ? 502 : 503
      );
    }
    try {
      const payload = (await res.json()) as {
        parcels?: unknown[];
        data?: unknown[];
      };
      if (Array.isArray(payload.parcels)) return payload.parcels;
      if (Array.isArray(payload.data)) return payload.data;
      throw new GatewayUnavailableError(
        `[api_search_parcels_point] invalid payload shape`
      );
    } catch (error) {
      Sentry.captureException(error, {
        tags: { route: "api.map.comps", method: "UNKNOWN" },
      });
      const reason = error instanceof Error ? error.message : String(error);
      throw new GatewayUnavailableError(
        `[api_search_parcels_point] invalid JSON: ${reason}`
      );
    }
  }
  throw new GatewayUnavailableError(
    `[${fnName}] unsupported property RPC`
  );
}

const QuerySchema = z
  .object({
    address: z.string().trim().min(1).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusMiles: z.coerce.number().min(0.1).max(25).default(3),
  })
  .refine(
    (value) =>
      Boolean(value.address) ||
      (typeof value.lat === "number" && typeof value.lng === "number"),
    {
      message: "Provide address or lat/lng",
      path: ["address"],
    }
  );

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * GET /api/map/comps?address=...&lat=...&lng=...&radiusMiles=3
 *
 * Searches the Property DB for comparable sales near a location or by address.
 * Returns parcels with sale price, date, acreage, and coordinates.
 */
export async function GET(req: NextRequest) {
  const context = createRequestObservabilityContext(req, "/api/map/comps");
  const addressParam = req.nextUrl.searchParams.get("address")?.trim() ?? "";
  const hasAddress = addressParam.length > 0;
  const hasLatLng = req.nextUrl.searchParams.has("lat") && req.nextUrl.searchParams.has("lng");
  const radiusMilesProvided = req.nextUrl.searchParams.has("radiusMiles");
  const baseDetails = {
    hasAddress,
    hasLatLng,
    radiusMilesProvided,
  };

  await logRequestStart(context, baseDetails);

  let auth: RouteAuthorizationSuccess["auth"] | null = null;

  const withRequestId = (response: NextResponse) =>
    attachRequestIdHeader(response, context.requestId);

  const authorization = await authorizeApiRoute(req, req.nextUrl.pathname);
  if (!authorization.ok || !authorization.auth) {
    const unauthorizedResponse = authorization.ok
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : authorization.response;
    await logRequestOutcome(context, {
      status: unauthorizedResponse.status,
      details: baseDetails,
    });
    return withRequestId(unauthorizedResponse);
  }
  auth = authorization.auth;
  if (!auth.orgId) {
    await logRequestOutcome(context, {
      status: 403,
      orgId: auth.orgId ?? null,
      userId: auth.userId ?? null,
      details: baseDetails,
    });
    return withRequestId(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  let input: z.infer<typeof QuerySchema>;
  try {
    input = QuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries())
    );
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "api.map.comps", method: "GET" },
    });
    if (err instanceof ZodError) {
      await logRequestOutcome(context, {
        status: 400,
        orgId: auth.orgId,
        userId: auth.userId,
        details: {
          ...baseDetails,
          validationError: true,
        },
      });
      return withRequestId(
        NextResponse.json(
          { error: "Validation failed", details: err.flatten().fieldErrors },
          { status: 400 }
        )
      );
    }
    await logRequestOutcome(context, {
      status: 400,
      orgId: auth.orgId,
      userId: auth.userId,
      details: {
        ...baseDetails,
        validationError: true,
      },
    });
    return withRequestId(NextResponse.json({ error: "Invalid request" }, { status: 400 }));
  }

  const address = input.address;
  const lat = input.lat;
  const lng = input.lng;
  const requestDetails = {
    ...baseDetails,
    hasAddress: Boolean(address),
    hasLatLng: typeof lat === "number" && typeof lng === "number",
    radiusMiles: input.radiusMiles,
  };
  let usedPointSearch = false;
  let usedPointFallback = false;
  let filteredByRadius = false;

  try {
    // Fail fast if the property DB gateway is not configured.
    ensureGatewayConfig();

    // Build search text from address or reverse-geocode location
    const searchText = address
      ? address.replace(/[''`,.#]/g, "").replace(/\s+/g, " ").trim()
      : "";

    let result: Record<string, unknown>[];

    if (searchText) {
      // Search by address text
      const raw = await propertyRpc(
        "api_search_parcels",
        {
          search_text: searchText,
          parish: null,
          limit_rows: 50,
        },
        context.requestId,
      );
      result = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
    } else {
      usedPointSearch = true;
      // Search by coordinates — use the search with a generic term and filter by distance
      // The property DB doesn't have a radius search, so we search with empty text
      // and rely on coordinates. For now, just return parcels near the point.
      const raw = await propertyRpc(
        "api_search_parcels",
        {
          search_text: `${lat},${lng}`,
          parish: null,
          limit_rows: 100,
        },
        context.requestId,
      );
      let mapped = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
      if (mapped.length === 0 && typeof lat === "number" && typeof lng === "number") {
        const pointRaw = await propertyRpc(
          "api_search_parcels_point",
          {
            lat,
            lng,
            limit: 100,
          },
          context.requestId,
        );
        mapped = Array.isArray(pointRaw)
          ? (pointRaw as Record<string, unknown>[])
          : [];
      }
      result = mapped;
    }

    // If address search returns no matches, fallback to point lookup if coordinates exist.
    if (
      result.length === 0 &&
      typeof lat === "number" &&
      typeof lng === "number"
    ) {
      usedPointFallback = true;
      const pointRaw = await propertyRpc(
        "api_search_parcels_point",
        {
          lat,
          lng,
          limit: 100,
        },
        context.requestId,
      );
      result = Array.isArray(pointRaw)
        ? (pointRaw as Record<string, unknown>[])
        : [];
    }

    // Map results to comp sale format
    const comps = result
      .filter((p) => {
        // Must have coordinates
        const pLat = asNumber(p.latitude ?? p.lat);
        const pLng = asNumber(p.longitude ?? p.lng);
        return pLat != null && pLng != null;
      })
      .map((p) => ({
        id: String(p.id ?? ""),
        address: String(p.site_address ?? p.address ?? "Unknown"),
        lat: asNumber(p.latitude ?? p.lat) ?? 0,
        lng: asNumber(p.longitude ?? p.lng) ?? 0,
        salePrice: asNumber(p.sale_price),
        saleDate: p.sale_date ? String(p.sale_date) : null,
        acreage: asNumber(p.acreage),
        pricePerAcre: (() => {
          const acreage = asNumber(p.acreage);
          const salePrice = asNumber(p.sale_price);
          if (!acreage || !salePrice || acreage <= 0) return null;
          return Math.round(salePrice / acreage);
        })(),
        pricePerSf: (() => {
          const acreage = asNumber(p.acreage);
          const salePrice = asNumber(p.sale_price);
          if (!acreage || !salePrice || acreage <= 0) return null;
          return Number((salePrice / (acreage * 43560)).toFixed(2));
        })(),
        useType: p.use_code ?? p.land_use ?? null,
      }));

    // If lat/lng provided, filter by distance
    if (typeof lat === "number" && typeof lng === "number") {
      const centerLat = lat;
      const centerLng = lng;
      const radiusMiles = input.radiusMiles;
      const radiusKm = radiusMiles * 1.60934;

      filteredByRadius = true;
      const filtered = comps.filter((c) => {
        const dLat = ((c.lat - centerLat) * Math.PI) / 180;
        const dLng = ((c.lng - centerLng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((centerLat * Math.PI) / 180) *
            Math.cos((c.lat * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
        const distKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return distKm <= radiusKm;
      });

      await logRequestOutcome(context, {
        status: 200,
        orgId: auth.orgId,
        userId: auth.userId,
        upstream: "property-db",
        resultCount: filtered.length,
        details: {
          ...requestDetails,
          usedPointSearch,
          usedPointFallback,
          filteredByRadius,
        },
      });
      return withRequestId(NextResponse.json({ comps: filtered }));
    }

    await logRequestOutcome(context, {
      status: 200,
      orgId: auth.orgId,
      userId: auth.userId,
      upstream: "property-db",
      resultCount: comps.length,
      details: {
        ...requestDetails,
        usedPointSearch,
        usedPointFallback,
        filteredByRadius,
      },
    });
    return withRequestId(NextResponse.json({ comps }));
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.map.comps", method: "GET" },
    });
    if (error instanceof GatewayConfigError || error instanceof GatewayUnavailableError) {
      console.error("[map-comps-route][gateway]", error);
      await logRequestOutcome(context, {
        status: 200,
        orgId: auth?.orgId ?? null,
        userId: auth?.userId ?? null,
        upstream: "property-db-fallback",
        details: {
          ...requestDetails,
          errorCode: error.code,
          degraded: true,
        },
      });
      return withRequestId(
        NextResponse.json(
          {
            comps: [],
            degraded: true,
            warning: "Property database unavailable; returning empty comps.",
            code: error.code,
          },
          { status: 200 },
        ),
      );
    }
    console.error("[map-comps-route]", error);
    await logRequestOutcome(context, {
      status: 500,
      orgId: auth?.orgId ?? null,
      userId: auth?.userId ?? null,
      upstream: "property-db",
      error,
      details: requestDetails,
    });
    return withRequestId(
      NextResponse.json(
        { error: "Failed to search comparables" },
        { status: 500 }
      )
    );
  }
}
