import { NextRequest, NextResponse } from "next/server";
import { prismaRead } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  attachRequestIdHeader,
  createRequestObservabilityContext,
  logRequestOutcome,
  logRequestStart,
} from "@/lib/server/observability";
import {
  getCloudflareAccessHeadersFromEnv,
  logPropertyDbRuntimeHealth,
  requireGatewayConfig,
} from "@/lib/server/propertyDbEnv";
import { isPrismaConnectivityError } from "@/lib/server/devParcelFallback";

const PROPERTY_DB_PARISHES = [
  "East Baton Rouge",
  "Ascension",
  "Livingston",
  "West Baton Rouge",
  "Iberville",
] as const;
const PROPERTY_DB_SEARCH_TERMS = [
  "Baton Rouge",
  "Ascension",
  "Livingston",
  "West Baton Rouge",
  "Iberville",
] as const;
const MAX_SEARCH_FALLBACK_QUERIES = 8;
const MAX_BASELINE_FALLBACK_QUERIES = 1;
const MAX_SEARCH_VARIANT_QUERIES = 2;
const LOCATION_STOP_WORDS = new Set([
  "baton",
  "rouge",
  "louisiana",
  "la",
  "usa",
  "united",
  "states",
]);
const PROPERTY_DB_GATEWAY_TIMEOUT_MS = Math.max(
  1500,
  Math.min(
    10000,
    Number.parseInt(process.env.PROPERTY_DB_GATEWAY_TIMEOUT_MS ?? "6500", 10) || 6500,
  ),
);

class GatewayUnavailableError extends Error {
  status: number;

  constructor(message: string, status: number = 503) {
    super(message);
    this.name = "GatewayUnavailableError";
    this.status = status;
  }
}

function isGatewayUnavailableError(error: unknown): error is GatewayUnavailableError {
  return error instanceof GatewayUnavailableError;
}

function sanitizeSearchInput(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f]/g, " ")
    .trim()
    .toLowerCase();
}

const STREET_SUFFIX_CANONICAL: Array<[RegExp, string]> = [
  [/\bdr\b/g, "drive"],
  [/\bst\b/g, "street"],
  [/\brd\b/g, "road"],
  [/\bave\b/g, "avenue"],
  [/\bblvd\b/g, "boulevard"],
  [/\bhwy\b/g, "highway"],
  [/\bln\b/g, "lane"],
];

function canonicalizeAddressLikeText(input: string): string {
  let value = sanitizeSearchInput(input);
  for (const [pattern, replacement] of STREET_SUFFIX_CANONICAL) {
    value = value.replace(pattern, replacement);
  }
  return value.replace(/\s+/g, " ").trim();
}

function toFiniteNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.replace(",", ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function computeCoordsFromBbox(row: Record<string, unknown>): [number, number] | null {
  const rawBbox = row.bbox;
  let bbox: unknown[] | null = null;
  if (Array.isArray(rawBbox) && rawBbox.length === 4) {
    bbox = rawBbox;
  } else if (typeof rawBbox === "string" && rawBbox.trim().length > 0) {
    const trimmed = rawBbox.trim();
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.length === 4) {
        bbox = parsed;
      }
    } catch {
      const csvParts = trimmed
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((part) => part.trim());
      if (csvParts.length === 4) {
        bbox = csvParts;
      }
    }
  }
  if (!bbox) return null;

  const minLng = toFiniteNumberOrNull(bbox[0]);
  const minLat = toFiniteNumberOrNull(bbox[1]);
  const maxLng = toFiniteNumberOrNull(bbox[2]);
  const maxLat = toFiniteNumberOrNull(bbox[3]);
  if (
    minLng == null ||
    minLat == null ||
    maxLng == null ||
    maxLat == null
  ) {
    return null;
  }

  return [(minLat + maxLat) / 2, (minLng + maxLng) / 2];
}

function parseGeometryCentroid(value: unknown): [number, number] | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return parseGeometryCentroid(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const geometry = value as Record<string, unknown>;
  const coordinates = geometry.coordinates;
  if (!Array.isArray(coordinates)) return null;

  const points: Array<[number, number]> = [];
  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (
      value.length >= 2 &&
      typeof value[0] === "number" &&
      Number.isFinite(value[0]) &&
      typeof value[1] === "number" &&
      Number.isFinite(value[1])
    ) {
      points.push([value[1], value[0]]);
      return;
    }
    for (const next of value) {
      visit(next);
    }
  };

  visit(coordinates);
  if (points.length === 0) return null;

  let lat = 0;
  let lng = 0;
  for (const point of points) {
    lat += point[0];
    lng += point[1];
  }
  const size = points.length;
  return [lat / size, lng / size];
}

function normalizeLatLngPair(first: number, second: number): [number, number] | null {
  const firstLooksLat = first >= -90 && first <= 90;
  const firstLooksLng = first >= -180 && first <= 180;
  const secondLooksLat = second >= -90 && second <= 90;
  const secondLooksLng = second >= -180 && second <= 180;

  if (firstLooksLat && secondLooksLng) return [first, second];
  if (firstLooksLng && secondLooksLat) return [second, first];
  return null;
}

function deriveAddressCentroid(
  value: unknown,
): [number, number] | null {
  if (!value) return null;
  if (typeof value === "string") {
    const [first, second] = value.split(",").map((part) => toFiniteNumberOrNull(part));
    if (first == null || second == null) return null;
    return normalizeLatLngPair(first, second);
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const centroid = value as Record<string, unknown>;
    const lat = toFiniteNumberOrNull(centroid.lat);
    const lng = toFiniteNumberOrNull(centroid.lng);
    if (lat != null && lng != null) {
      return [lat, lng];
    }
    const x = toFiniteNumberOrNull(centroid.x);
    const y = toFiniteNumberOrNull(centroid.y);
    if (x != null && y != null) {
      const normalized = normalizeLatLngPair(x, y);
      if (normalized) return normalized;
    }
  }
  if (Array.isArray(value) && value.length >= 2) {
    const first = toFiniteNumberOrNull(value[0]);
    const second = toFiniteNumberOrNull(value[1]);
    if (first != null && second != null) {
      return normalizeLatLngPair(first, second);
    }
  }
  return null;
}

function buildSearchTerms(rawText: string): string[] {
  const normalized = canonicalizeAddressLikeText(rawText);
  if (!normalized) return ["*"];

  const terms = new Set<string>([normalized]);
  const words = normalized.split(" ").filter(Boolean);

  if (words.length === 1) {
    terms.add(words[0]);
  } else {
    terms.add(normalized);
    if (words.length >= 2) {
      terms.add(`${words[0]} ${words[1]}`);
      terms.add(`${words[words.length - 2]} ${words[words.length - 1]}`);
      terms.add(words[0]);
      terms.add(words[words.length - 1]);
    }
  }

  const noUnit = normalized
    .replace(/\b(apt|unit|suite|ste|#)\s*\w+$/i, "")
    .replace(/,$/u, "")
    .trim();
  if (noUnit && noUnit !== normalized) {
    terms.add(noUnit);
    const noUnitWords = noUnit.split(" ").filter(Boolean);
    if (noUnitWords.length >= 2) {
      terms.add(noUnitWords.slice(0, 2).join(" "));
    }
  }

  if (!terms.has("*")) terms.add("*");
  return Array.from(terms).filter(Boolean);
}

function buildGatewaySearchTerms(rawText: string): string[] {
  const normalized = canonicalizeAddressLikeText(rawText);
  if (!normalized) return [];

  const tokens = normalized.split(" ").filter(Boolean);
  const nonZipTokens = tokens.filter((token) => !/^\d{5}(?:-\d{4})?$/.test(token));
  const nonLocationTokens = nonZipTokens.filter((token) => !LOCATION_STOP_WORDS.has(token));
  const withoutHouseNumber = nonLocationTokens[0] && /^\d+[a-z]*$/i.test(nonLocationTokens[0])
    ? nonLocationTokens.slice(1)
    : nonLocationTokens;

  const out = new Set<string>();
  if (withoutHouseNumber.length > 0) out.add(withoutHouseNumber.join(" "));
  if (nonLocationTokens.length > 0) out.add(nonLocationTokens.join(" "));
  if (withoutHouseNumber.length >= 2) {
    out.add(withoutHouseNumber.slice(0, 2).join(" "));
    out.add(withoutHouseNumber[0]);
  }
  out.add(normalized);

  return Array.from(out).map((value) => value.trim()).filter((value) => value.length >= 2);
}

function normalizeParcelCandidate(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const collapsed = trimmed.replace(/\s+/g, " ");
  const normalized = collapsed.toLowerCase();
  const bare = normalized
    .replace(/[^\w\s.#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const out = new Set<string>();
  if (trimmed.length > 0) out.add(trimmed);
  if (normalized.length > 0) out.add(normalized);
  if (bare.length > 0) out.add(bare);

  const words = normalized.split(" ");
  if (words.length >= 2) {
    out.add(words.slice(0, 2).join(" "));
    out.add(words.slice(-2).join(" "));
    out.add(words[0]);
    out.add(words[words.length - 1]);
  }

  return Array.from(out).filter(Boolean);
}

function parseRpcResponseArray(value: string): unknown[] {
  if (!value) return [];
  try {
    const json = JSON.parse(value);
    return normalizeRpcRows(json);
  } catch {
    return [];
  }
}

function logParcelsDevPayload(
  phase: string,
  details: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV === "production") return;
  console.info("[/api/parcels][dev-payload]", {
    phase,
    ...details,
  });
}

function normalizeRpcRows(value: unknown): Record<string, unknown>[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .filter((item): item is Record<string, unknown> =>
        item !== null && typeof item === "object" && !Array.isArray(item),
      )
      .map((item) => item as Record<string, unknown>);
  }

  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (Array.isArray(object.data)) return normalizeRpcRows(object.data);
    if (Array.isArray(object.rows)) return normalizeRpcRows(object.rows);
    if (Array.isArray(object.result)) return normalizeRpcRows(object.result);
    if (Array.isArray(object.items)) return normalizeRpcRows(object.items);
    if (Array.isArray(object.parcels)) return normalizeRpcRows(object.parcels);
    if ("error" in object) return [];

    if (
      object.id != null ||
      object.site_address != null ||
      object.situs_address != null
    ) {
      return [object];
    }
  }

  return [];
}

async function gatewaySearchParcels(q: string, limit: number): Promise<unknown[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROPERTY_DB_GATEWAY_TIMEOUT_MS);
  try {
    const { url, key } = requireGatewayConfig("/api/parcels");
    const params = new URLSearchParams({ q, limit: String(limit) });
    const res = await fetch(`${url}/api/parcels/search?${params}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        ...getCloudflareAccessHeadersFromEnv(),
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      // Upstream 4xx responses are treated as "no matches" for this query
      // so user-facing search can continue trying alternative terms.
      if (res.status < 500) {
        return [];
      }
      const errBody = await res.text().catch(() => "");
      throw new GatewayUnavailableError(
        `[gatewaySearchParcels] failed: ${res.status} ${errBody.slice(0, 300)}`,
        502,
      );
    }
    const text = await res.text().catch(() => "");
    if (!text) return [];
    return parseRpcResponseArray(text);
  } catch (err) {
    if (isGatewayUnavailableError(err)) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new GatewayUnavailableError(`[gatewaySearchParcels] exception: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}


async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  maxConcurrent: number = 5,
): Promise<PromiseSettledResult<T>[]> {
  const limit = Math.max(1, maxConcurrent);
  const results: Array<PromiseSettledResult<T>> = new Array(tasks.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      try {
        const value = await tasks[currentIndex]();
        results[currentIndex] = { status: "fulfilled", value };
      } catch (reason) {
        results[currentIndex] = { status: "rejected", reason };
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, () => worker()),
  );

  return results;
}

function mapExternalParcelToApiShape(
  row: Record<string, unknown>,
): Record<string, unknown> | null {
  const geometryCentroid = parseGeometryCentroid(
    row.geometry ??
      row.geom_geojson ??
      row.geom_simplified ??
      row.geom ??
      row.geom_geo_json ??
      row.geometry_geojson ??
      row.polygon,
  );
  const fallbackCoords =
    computeCoordsFromBbox(row) ??
    deriveAddressCentroid(row.centroid) ??
    deriveAddressCentroid(row.center) ??
    deriveAddressCentroid(row.geometry_center) ??
    deriveAddressCentroid(geometryCentroid) ??
    deriveAddressCentroid(row.centroid_lat_lng) ??
    deriveAddressCentroid(row.location);
  const lat = toFiniteNumberOrNull(row.latitude ?? row.lat) ??
    toFiniteNumberOrNull(row.geom_y) ??
    toFiniteNumberOrNull(row.y) ??
    toFiniteNumberOrNull(row.centroid_lat) ??
    toFiniteNumberOrNull(row.lat_centroid) ??
    toFiniteNumberOrNull(row.lat0) ??
    fallbackCoords?.[0];
  const lng = toFiniteNumberOrNull(row.longitude ?? row.lng) ??
    toFiniteNumberOrNull(row.geom_x) ??
    toFiniteNumberOrNull(row.x) ??
    toFiniteNumberOrNull(row.centroid_lng) ??
    toFiniteNumberOrNull(row.lng_centroid) ??
    toFiniteNumberOrNull(row.lng0) ??
    fallbackCoords?.[1];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const propertyDbId = String(
    row.id ?? row.parcel_uid ?? row.parcel_id ?? row.apn ?? "",
  );
  const address = String(row.site_address ?? row.situs_address ?? row.address ?? "Unknown");
  const normalizedAddress = canonicalizeAddressLikeText(address);

  return {
    id: `ext-${propertyDbId || `${lat}-${lng}`}`,
    address,
    lat,
    lng,
    acreage:
      row.acreage != null && Number.isFinite(Number(row.acreage))
        ? Number(row.acreage)
        : null,
    floodZone: row.flood_zone ? String(row.flood_zone) : null,
    currentZoning: row.zoning ? String(row.zoning) : row.zoning_type ? String(row.zoning_type) : row.zone_code ? String(row.zone_code) : null,
    propertyDbId,
    geometryLookupKey: propertyDbId || address,
    searchText: normalizedAddress,
    deal: null,
  };
}

function matchesSearchQuery(
  parcel: Record<string, unknown>,
  query: string,
): boolean {
  if (!query) return true;
  const q = canonicalizeAddressLikeText(query);
  const canonicalFields = [
    parcel.address,
    parcel.searchText,
    parcel.currentZoning,
    parcel.floodZone,
    parcel.propertyDbId,
  ]
    .filter((value): value is string => typeof value === "string")
    .map((value) => canonicalizeAddressLikeText(value))
    .filter(Boolean);
  if (canonicalFields.some((value) => value.includes(q))) return true;

  const tokenMatches = q
    .split(" ")
    .map((token) => token.trim())
    .filter((token) =>
      token.length >= 2 &&
      !/^\d{5}(?:-\d{4})?$/.test(token) &&
      !LOCATION_STOP_WORDS.has(token)
    );
  if (tokenMatches.length === 0) return false;

  return tokenMatches.every((token) =>
    canonicalFields.some((field) => field.includes(token))
  );
}

function parcelDedupKey(parcel: Record<string, unknown>): string {
  const propertyDbId = typeof parcel.propertyDbId === "string"
    ? parcel.propertyDbId.trim()
    : "";
  if (propertyDbId) return `propertyDbId:${propertyDbId}`;

  const address = typeof parcel.address === "string"
    ? canonicalizeAddressLikeText(parcel.address)
    : "";
  if (address) return `address:${address}`;

  const id = typeof parcel.id === "string" ? parcel.id.trim() : "";
  if (id) return `id:${id}`;

  const lat = typeof parcel.lat === "number" && Number.isFinite(parcel.lat)
    ? parcel.lat.toFixed(6)
    : "";
  const lng = typeof parcel.lng === "number" && Number.isFinite(parcel.lng)
    ? parcel.lng.toFixed(6)
    : "";
  return `coords:${lat}:${lng}`;
}

function mergeParcelResults(
  primary: Record<string, unknown>[],
  secondary: Record<string, unknown>[],
): Record<string, unknown>[] {
  const merged = new Map<string, Record<string, unknown>>();
  for (const parcel of primary) {
    merged.set(parcelDedupKey(parcel), parcel);
  }
  for (const parcel of secondary) {
    const key = parcelDedupKey(parcel);
    if (!merged.has(key)) {
      merged.set(key, parcel);
    }
  }
  return Array.from(merged.values());
}

async function searchPropertyDbParcels(
  searchText: string,
  _parish?: string,
  limitRows: number = 120,
): Promise<unknown[]> {
  const q = searchText.trim() || "*";
  const limit = Math.min(limitRows, 100);
  return gatewaySearchParcels(q, limit);
}

function hasLatLng(parcel: Record<string, unknown>): boolean {
  return (
    typeof parcel.lat === "number" &&
    Number.isFinite(parcel.lat) &&
    typeof parcel.lng === "number" &&
    Number.isFinite(parcel.lng)
  );
}

async function fetchOrgFallbackParcels(
  orgId: string,
  searchText: string,
): Promise<Record<string, unknown>[]> {
  const parcels = await prismaRead.parcel.findMany({
    where: { orgId },
    include: {
      deal: {
        select: { id: true, name: true, sku: true, status: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const asRecords = parcels as Record<string, unknown>[];
  const withCoords = asRecords.filter(hasLatLng);
  if (!searchText) {
    return withCoords.slice(0, 500);
  }

  const filtered = withCoords.filter((parcel) =>
    matchesSearchQuery(parcel, searchText),
  );
  return (filtered.length > 0 ? filtered : withCoords).slice(0, 500);
}

// GET /api/parcels - list parcels across all deals
export async function GET(request: NextRequest) {
  const context = createRequestObservabilityContext(request, "/api/parcels");
  const withRequestId = (response: NextResponse) => attachRequestIdHeader(response, context.requestId);
  const hasCoords = request.nextUrl.searchParams.get("hasCoords") === "true";
  const searchText = request.nextUrl.searchParams.get("search")?.trim() ?? "";
  const hasSearch = searchText.length > 0;
  const requiresGateway = hasCoords || hasSearch;
  const baseDetails = {
    hasCoords,
    hasSearch,
    searchLength: searchText.length,
    requiresGateway,
  };

  await logRequestStart(context, baseDetails);

  let auth: Awaited<ReturnType<typeof resolveAuth>> | null = null;
  let fallbackQueryCount = 0;

  try {
    auth = await resolveAuth(request);
    if (!auth) {
      await logRequestOutcome(context, { status: 401, details: baseDetails });
      return withRequestId(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }

    if (!requiresGateway) {
      const where: Record<string, unknown> = { orgId: auth.orgId };
      try {
        const parcels = await prismaRead.parcel.findMany({
          where,
          include: {
            deal: {
              select: { id: true, name: true, sku: true, status: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 500,
        });
        logParcelsDevPayload("org", {
          hasCoords,
          searchText,
          parcelCount: parcels.length,
        });
        await logRequestOutcome(context, {
          status: 200,
          orgId: auth.orgId,
          userId: auth.userId,
          upstream: "org",
          resultCount: parcels.length,
          details: {
            ...baseDetails,
            source: "org",
          },
        });
        return withRequestId(NextResponse.json({ parcels, source: "org" }));
      } catch (error) {
        if (isPrismaConnectivityError(error)) {
          console.error(
            "[/api/parcels] prisma unavailable for org parcels",
            error,
          );
          await logRequestOutcome(context, {
            status: 503,
            orgId: auth.orgId,
            userId: auth.userId,
            upstream: "org",
            error,
            details: {
              ...baseDetails,
              source: "org",
              reason: "prisma_unavailable",
            },
          });
          return withRequestId(NextResponse.json(
            {
              error: "Parcel store unavailable",
              code: "ORG_DATA_UNAVAILABLE",
            },
            { status: 503 },
          ));
        }
        throw error;
      }
    }

    let orgSearchMatches: Record<string, unknown>[] = [];
    if (hasSearch) {
      try {
        orgSearchMatches = await fetchOrgFallbackParcels(auth.orgId, searchText);
      } catch (orgSearchError) {
        console.error("[/api/parcels] org search seed failed", orgSearchError);
      }
    }

    const fallbackQueries: Array<() => Promise<unknown[]>> = searchText
      ? Array.from(
          new Set([
            ...buildGatewaySearchTerms(searchText),
            ...normalizeParcelCandidate(searchText),
          ]),
        )
          .filter((term) => term.trim().length > 0 && term.trim() !== "*")
          .slice(0, MAX_SEARCH_VARIANT_QUERIES)
          .map((term, index) =>
            () => searchPropertyDbParcels(term, undefined, index === 0 ? 30 : 20),
          )
      : [
          // Single broad seed — wildcard returns a representative cross-parish set.
          () => searchPropertyDbParcels("*", undefined, 200),
        ].slice(0, MAX_BASELINE_FALLBACK_QUERIES);
    fallbackQueryCount = fallbackQueries.length;

    const gatewayConfig = logPropertyDbRuntimeHealth("/api/parcels");
    if (!gatewayConfig) {
      throw new GatewayUnavailableError(
        "[/api/parcels] property DB gateway is not configured",
        503,
      );
    }

    const fallbackResults = await runWithConcurrency(
      fallbackQueries,
      hasSearch ? 1 : 5,
    );
    const fulfilled = fallbackResults.filter(
      (result): result is PromiseFulfilledResult<unknown[]> =>
        result.status === "fulfilled",
    );
    if (fulfilled.length === 0) {
      const gatewayError = fallbackResults.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected" && isGatewayUnavailableError(result.reason),
      );
      if (gatewayError) {
        throw gatewayError.reason;
      }
      const firstRejection = fallbackResults.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      if (firstRejection) {
        const reason = firstRejection.reason instanceof Error
          ? firstRejection.reason.message
          : String(firstRejection.reason ?? "unknown error");
        throw new GatewayUnavailableError(`[gatewaySearchParcels] ${reason}`, 502);
      }
    }

    const parishResults = fulfilled.map((result) => result.value);

    const externalRows = parishResults.flat();
    if (externalRows.length === 0) {
      if (orgSearchMatches.length > 0) {
        await logRequestOutcome(context, {
          status: 200,
          orgId: auth.orgId,
          userId: auth.userId,
          upstream: "property-db",
          resultCount: orgSearchMatches.length,
          details: {
            ...baseDetails,
            source: "org-search",
            fallbackQueryCount,
            externalRowCount: 0,
            orgSearchMatchCount: orgSearchMatches.length,
            degraded: true,
          },
        });
        return withRequestId(NextResponse.json({
          parcels: orgSearchMatches.slice(0, 500),
          source: "org",
          degraded: true,
          warning:
            "Property DB search returned no matches; returning org-scoped parcel matches.",
        }));
      }
      logParcelsDevPayload("property-db-empty", {
        hasCoords,
        searchText,
        externalRowCount: 0,
      });
      await logRequestOutcome(context, {
        status: 200,
        orgId: auth.orgId,
        userId: auth.userId,
        upstream: "property-db",
        resultCount: 0,
        details: {
          ...baseDetails,
          source: "property-db",
          fallbackQueryCount,
          externalRowCount: 0,
          emptyResult: true,
        },
      });
      return withRequestId(NextResponse.json({
        parcels: [],
        source: "property-db",
        error: searchText
          ? "No matches found for the provided search terms."
          : "No parcels found in this region.",
      }));
    }

    const mappedExternal = externalRows
      .map((row) =>
        typeof row === "object" && row !== null
          ? mapExternalParcelToApiShape(row as Record<string, unknown>)
          : null,
      )
      .filter((row): row is Record<string, unknown> => row !== null);

    if (
      process.env.NODE_ENV !== "production" &&
      externalRows.length > 0 &&
      mappedExternal.length === 0
    ) {
      const sample = externalRows.find(
        (row): row is Record<string, unknown> =>
          typeof row === "object" && row !== null && !Array.isArray(row),
      );
      console.warn("[/api/parcels] fallback rows found but none mapped to coords", {
        externalRowCount: externalRows.length,
        sampleKeys: sample ? Object.keys(sample).slice(0, 20) : [],
      });
    }

    const filteredExternal = searchText
      ? (() => {
          const preFiltered = mappedExternal.filter((parcel) =>
            matchesSearchQuery(parcel, searchText),
          );
          return preFiltered;
        })()
      : mappedExternal;

    const deduped = mergeParcelResults(filteredExternal, orgSearchMatches).slice(0, 500);

    logParcelsDevPayload("property-db", {
      hasCoords,
      searchText,
      externalRowCount: externalRows.length,
      mappedCount: mappedExternal.length,
      filteredCount: filteredExternal.length,
      dedupedCount: deduped.length,
      withPropertyDbIdCount: deduped.filter((parcel) =>
        typeof parcel === "object" &&
        parcel !== null &&
        "propertyDbId" in parcel &&
        typeof (parcel as { propertyDbId?: unknown }).propertyDbId === "string" &&
        ((parcel as { propertyDbId: string }).propertyDbId).trim().length > 0,
      ).length,
    });

    await logRequestOutcome(context, {
      status: 200,
      orgId: auth.orgId,
      userId: auth.userId,
      upstream: "property-db",
      resultCount: deduped.length,
      details: {
        ...baseDetails,
        source: "property-db",
        fallbackQueryCount,
        externalRowCount: externalRows.length,
        mappedCount: mappedExternal.length,
        filteredCount: filteredExternal.length,
        orgSearchMatchCount: orgSearchMatches.length,
        dedupedCount: deduped.length,
      },
    });
    const response = NextResponse.json({ parcels: deduped, source: "property-db" });
    // Short-lived cache: 30s fresh, serve stale up to 2min while revalidating
    response.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=120");
    return withRequestId(response);
  } catch (error) {
    if (isGatewayUnavailableError(error)) {
      console.error("[/api/parcels] property DB unavailable", error);
      if (auth?.orgId) {
        try {
          const orgFallback = await fetchOrgFallbackParcels(auth.orgId, searchText);
          await logRequestOutcome(context, {
            status: 200,
            orgId: auth.orgId,
            userId: auth.userId,
            upstream: "org-fallback",
            resultCount: orgFallback.length,
            details: {
              ...baseDetails,
              fallbackQueryCount,
              source: "org-fallback",
              degraded: true,
              gatewayUnavailable: true,
            },
          });
          return withRequestId(
            NextResponse.json({
              parcels: orgFallback,
              source: "org-fallback",
              degraded: true,
              warning: "Property database unavailable; returned org-scoped fallback parcels.",
            }),
          );
        } catch (fallbackError) {
          console.error("[/api/parcels] org fallback failed", fallbackError);
        }
      }
      await logRequestOutcome(context, {
        status: error.status ?? 503,
        orgId: auth?.orgId ?? null,
        userId: auth?.userId ?? null,
        upstream: "property-db",
        error,
        details: {
          ...baseDetails,
          fallbackQueryCount,
          gatewayConfigured: false,
        },
      });
      return withRequestId(NextResponse.json(
        { error: "Property database unavailable", code: "GATEWAY_UNAVAILABLE" },
        { status: error.status ?? 503 },
      ));
    }
    console.error("Error fetching parcels:", error);
    await logRequestOutcome(context, {
      status: 500,
      orgId: auth?.orgId ?? null,
      userId: auth?.userId ?? null,
      upstream: requiresGateway ? "property-db" : "org",
      error,
      details: baseDetails,
    });
    return withRequestId(NextResponse.json(
      { error: "Failed to fetch parcels" },
      { status: 500 }
    ));
  }
}
