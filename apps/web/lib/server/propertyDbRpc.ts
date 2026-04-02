import "server-only";

import {
  getCloudflareAccessHeadersFromEnv,
  requireGatewayConfig,
} from "@/lib/server/propertyDbEnv";

type PropertyDbRpcFnName = "api_search_parcels" | "api_get_parcel" | "api_screen_full";
type PropertyDbRecord = Record<string, unknown>;
export type PropertyDbGatewayScope =
  | "parcels.read"
  | "map.read"
  | "map.tiles.read"
  | "places.read";
export const PROPERTY_DB_INTERNAL_SCOPE_HEADER = "x-gpc-internal-scope";

interface GatewayEnvelope<T> {
  ok?: boolean;
  error?: string;
  data?: T;
  parcels?: T;
}

const DEFAULT_GATEWAY_TIMEOUT_MS = 8_000;
const MAX_RETRIES = 1;

interface PropertyDbGatewayRequestOptions {
  routeTag: string;
  path: string;
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: BodyInit;
  cache?: RequestCache;
  requestId?: string;
  includeApiKey?: boolean;
  internalScope?: PropertyDbGatewayScope;
  timeoutMs?: number;
  maxRetries?: number;
}

export function getPropertyDbScopeHeaders(
  scope: PropertyDbGatewayScope,
): Record<string, string> {
  return { [PROPERTY_DB_INTERNAL_SCOPE_HEADER]: scope };
}

function getGatewayTimeoutMs(override?: number): number {
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return Math.floor(override);
  }
  const raw = Number(process.env.PROPERTY_DB_GATEWAY_TIMEOUT_MS ?? "");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_GATEWAY_TIMEOUT_MS;
}

function getGatewayRetryCount(override?: number): number {
  if (typeof override === "number" && Number.isFinite(override) && override >= 0) {
    return Math.floor(override);
  }
  return MAX_RETRIES;
}

function isRecord(value: unknown): value is PropertyDbRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): PropertyDbRecord | null {
  return isRecord(value) ? value : null;
}

function toNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requireParcelId(body: PropertyDbRecord): string {
  const parcelId = toNonEmptyString(body.p_parcel_id ?? body.parcel_id ?? body.parcelId);
  if (!parcelId) {
    throw new Error("[property-db-rpc] parcel_id is required");
  }
  return parcelId;
}

function normalizeFlood(data: PropertyDbRecord | null): PropertyDbRecord | null {
  if (!data) return null;

  const zones = Array.isArray(data.zones)
    ? data.zones
        .map<PropertyDbRecord | null>((zone) => {
          const record = asRecord(zone);
          if (!record) return null;
          return {
            zone_code: record.floodZone ?? record.zone_code ?? null,
            overlap_pct: record.overlapPct ?? record.overlap_pct ?? 0,
            bfe: record.bfe ?? null,
            panel_id: record.panelId ?? record.panel_id ?? null,
            in_sfha: record.inSfha ?? record.in_sfha ?? null,
          } satisfies PropertyDbRecord;
        })
        .filter((zone): zone is PropertyDbRecord => zone !== null)
    : [];

  return {
    in_sfha: data.inSfha ?? data.in_sfha ?? false,
    zone_count: data.zoneCount ?? data.zone_count ?? zones.length,
    zones,
  };
}

function normalizeSoils(data: PropertyDbRecord | null): PropertyDbRecord | null {
  if (!data) return null;

  const soilTypes = Array.isArray(data.soilUnits)
    ? data.soilUnits
        .map<PropertyDbRecord | null>((unit) => {
          const record = asRecord(unit);
          if (!record) return null;
          return {
            soil_name: record.mapunitKey ?? record.soil_name ?? null,
            mapunit_key: record.mapunitKey ?? record.mapunit_key ?? null,
            drainage_class: record.drainageClass ?? record.drainage_class ?? null,
            hydric_rating: record.hydricRating ?? record.hydric_rating ?? null,
            shrink_swell: record.shrinkSwell ?? record.shrink_swell ?? null,
            overlap_pct: record.overlapPct ?? record.overlap_pct ?? 0,
          } satisfies PropertyDbRecord;
        })
        .filter((unit): unit is PropertyDbRecord => unit !== null)
    : [];

  return {
    has_hydric: data.hasHydric ?? data.has_hydric ?? false,
    unit_count: data.unitCount ?? data.unit_count ?? soilTypes.length,
    soil_types: soilTypes,
  };
}

function normalizeWetlands(data: PropertyDbRecord | null): PropertyDbRecord | null {
  if (!data) return null;

  const wetlandAreas = Array.isArray(data.wetlandAreas)
    ? data.wetlandAreas
        .map<PropertyDbRecord | null>((area) => {
          const record = asRecord(area);
          if (!record) return null;
          return {
            wetland_type: record.wetlandType ?? record.wetland_type ?? null,
            overlap_pct: record.overlapPct ?? record.overlap_pct ?? 0,
          } satisfies PropertyDbRecord;
        })
        .filter((area): area is PropertyDbRecord => area !== null)
    : [];

  return {
    has_wetlands: data.hasWetlands ?? data.has_wetlands ?? false,
    area_count: data.areaCount ?? data.area_count ?? wetlandAreas.length,
    wetland_areas: wetlandAreas,
  };
}

function normalizeEpa(data: PropertyDbRecord | null): PropertyDbRecord | null {
  if (!data) return null;

  const sites = Array.isArray(data.facilities)
    ? data.facilities
        .map<PropertyDbRecord | null>((facility) => {
          const record = asRecord(facility);
          if (!record) return null;
          return {
            registry_id: record.registryId ?? record.registry_id ?? null,
            facility_name: record.name ?? record.facility_name ?? null,
            city: record.city ?? null,
            status: record.status ?? null,
            violations: record.violationsLast3yr ?? record.violations ?? null,
            penalties: record.penaltiesLast3yr ?? record.penalties ?? null,
            distance_miles: record.distanceMiles ?? record.distance_miles ?? null,
          } satisfies PropertyDbRecord;
        })
        .filter((facility): facility is PropertyDbRecord => facility !== null)
    : [];

  return {
    site_count: data.facilityCount ?? data.site_count ?? sites.length,
    sites,
  };
}

function normalizeTraffic(data: PropertyDbRecord | null): PropertyDbRecord | null {
  if (!data) return null;

  const roads = Array.isArray(data.trafficCounts)
    ? data.trafficCounts
        .map<PropertyDbRecord | null>((count) => {
          const record = asRecord(count);
          if (!record) return null;
          return {
            road_name: record.route ?? record.road_name ?? null,
            aadt: record.aadt ?? null,
            year: record.year ?? null,
            truck_pct: record.truckPct ?? record.truck_pct ?? null,
            distance_miles: record.distanceMiles ?? record.distance_miles ?? null,
          } satisfies PropertyDbRecord;
        })
        .filter((count): count is PropertyDbRecord => count !== null)
    : [];

  return {
    available: data.available ?? roads.length > 0,
    count_stations: data.countStations ?? data.count_stations ?? roads.length,
    message: data.message ?? null,
    roads,
  };
}

function normalizeLdeq(data: PropertyDbRecord | null): PropertyDbRecord | null {
  if (!data) return null;

  const permits = Array.isArray(data.permits)
    ? data.permits
        .map<PropertyDbRecord | null>((permit) => {
          const record = asRecord(permit);
          if (!record) return null;
          return {
            ai_number: record.aiNumber ?? record.ai_number ?? null,
            facility_name: record.facilityName ?? record.facility_name ?? null,
            permit_type: record.permitType ?? record.permit_type ?? null,
            status: record.status ?? null,
            distance_miles: record.distanceMiles ?? record.distance_miles ?? null,
          } satisfies PropertyDbRecord;
        })
        .filter((permit): permit is PropertyDbRecord => permit !== null)
    : [];

  return {
    available: data.available ?? permits.length > 0,
    permit_count: data.permitCount ?? data.permit_count ?? permits.length,
    message: data.message ?? null,
    permits,
  };
}

function normalizeScreeningPayload(data: unknown): PropertyDbRecord | null {
  const record = asRecord(data);
  if (!record) return null;

  return {
    parcel_id: record.parcelId ?? record.parcel_id ?? null,
    zoning: asRecord(record.zoning),
    flood: normalizeFlood(asRecord(record.flood)),
    soils: normalizeSoils(asRecord(record.soils)),
    wetlands: normalizeWetlands(asRecord(record.wetlands)),
    epa: normalizeEpa(asRecord(record.epa)),
    traffic: normalizeTraffic(asRecord(record.traffic)),
    ldeq: normalizeLdeq(asRecord(record.ldeq)),
  };
}

async function parseEnvelope<T>(res: Response, fnName: string): Promise<GatewayEnvelope<T>> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `[property-db-rpc] ${fnName} failed (${res.status}): ${text.slice(0, 240) || "No response body"}`,
    );
  }

  const payload = (await res.json()) as GatewayEnvelope<T>;
  if (payload.ok === false) {
    throw new Error(`[property-db-rpc] ${fnName} failed: ${payload.error ?? "Unknown error"}`);
  }

  return payload;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === "AbortError") return true;
    const msg = error.message.toLowerCase();
    return msg.includes("econnreset") || msg.includes("socket hang up") || msg.includes("fetch failed");
  }
  return false;
}

async function fetchGateway(
  url: string,
  init: RequestInit,
  fnName: string,
  timeoutOverrideMs?: number,
  retryOverride?: number,
): Promise<Response> {
  const timeoutMs = getGatewayTimeoutMs(timeoutOverrideMs);
  const maxRetries = getGatewayRetryCount(retryOverride);
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      if (response.status >= 500 && attempt < maxRetries) {
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      clearTimeout(timeout);

      if (attempt < maxRetries && isRetryableError(error)) {
        continue;
      }

      const reason =
        error instanceof Error && error.name === "AbortError"
          ? `request timed out after ${timeoutMs}ms`
          : error instanceof Error
            ? error.message
            : String(error);
      throw new Error(`[property-db-rpc] ${fnName} request failed: ${reason}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError;
}

/**
 * Shared property-db gateway request path for apps/web server routes.
 * Applies the repo-standard timeout/retry policy and injects auth/access headers.
 */
export async function requestPropertyDbGateway(
  options: PropertyDbGatewayRequestOptions,
): Promise<Response> {
  const {
    routeTag,
    path,
    method = "GET",
    headers = {},
    body,
    cache = "no-store",
    requestId,
    includeApiKey = false,
    internalScope,
    timeoutMs,
    maxRetries,
  } = options;
  const { url, key } = requireGatewayConfig(routeTag);
  const baseUrl = url.replace(/\/$/, "");

  return fetchGateway(
    `${baseUrl}${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(includeApiKey ? { apikey: key } : {}),
        ...(requestId ? { "x-request-id": requestId } : {}),
        ...(internalScope ? getPropertyDbScopeHeaders(internalScope) : {}),
        ...getCloudflareAccessHeadersFromEnv(),
        ...headers,
      },
      ...(body ? { body } : {}),
      cache,
    },
    routeTag,
    timeoutMs,
    maxRetries,
  );
}

export async function propertyDbRpc(
  fnName: PropertyDbRpcFnName,
  body: PropertyDbRecord,
): Promise<unknown> {
  if (fnName === "api_search_parcels") {
    const q = toNonEmptyString(body.p_search_text ?? body.search_text);
    const parish = toNonEmptyString(body.p_parish ?? body.parish);
    const rawLimit = Number(body.p_limit ?? body.limit_rows ?? 50);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, rawLimit)) : 50;
    const params = new URLSearchParams({
      q,
      limit: String(limit),
    });
    if (parish) {
      params.set("parish", parish);
    }

    const res = await requestPropertyDbGateway({
      routeTag: fnName,
      path: `/api/parcels/search?${params.toString()}`,
      method: "GET",
      cache: "no-store",
      internalScope: "parcels.read",
    });
    const payload = await parseEnvelope<unknown[]>(res, fnName);
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.parcels)) return payload.parcels;
    return [];
  }

  if (fnName === "api_get_parcel") {
    const parcelId = requireParcelId(body);
    const res = await requestPropertyDbGateway({
      routeTag: fnName,
      path: `/api/parcels/${encodeURIComponent(parcelId)}`,
      method: "GET",
      cache: "no-store",
      internalScope: "parcels.read",
    });
    const payload = await parseEnvelope<PropertyDbRecord>(res, fnName);
    return payload.data ?? null;
  }

  if (fnName === "api_screen_full") {
    const parcelId = requireParcelId(body);
    const res = await requestPropertyDbGateway({
      routeTag: fnName,
      path: "/api/screening/full",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ parcelId }),
      cache: "no-store",
      internalScope: "parcels.read",
    });
    const payload = await parseEnvelope<unknown>(res, fnName);
    return normalizeScreeningPayload(payload.data);
  }

  const exhaustiveCheck: never = fnName;
  throw new Error(`[property-db-rpc] Unsupported fnName: ${String(exhaustiveCheck)}`);
}
