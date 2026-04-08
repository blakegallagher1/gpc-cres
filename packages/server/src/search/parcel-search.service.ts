import { prismaRead } from "@entitlement-os/db";
import {
  PropertyDbGatewayError,
  getPropertyDbConfigOrNull,
  getPropertyDbScopeHeaders,
  requestPropertyDbGateway,
} from "./property-db-gateway.service";
import {
  LOCATION_STOP_WORDS,
  canonicalizeAddressLikeText,
  isBatonRougeScopedText,
  isEastBatonRougeCoordinate,
  isExplicitOutOfRegionQuery,
  normalizeParcelId,
  sanitizeSearchInput,
  toFiniteNumberOrNull,
} from "./spatial-search.shared";

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
const MAX_SEARCH_VARIANT_QUERIES = 2;
const BASELINE_GATEWAY_RESULT_LIMIT = 50;
const MAX_BASELINE_FALLBACK_QUERIES = 1;
const GATEWAY_TIMEOUT_MS = 4_000;

type ParcelApiRecord = Record<string, unknown>;

type SuggestionRow = {
  id: string;
  parcelId: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  propertyDbId: string | null;
  hasGeometry: boolean;
  owner?: string | null;
  source?: "org" | "property_db";
};

export type ParcelRouteServiceResult = {
  status: number;
  body: Record<string, unknown>;
  cacheControl?: string;
  upstream: string;
  resultCount: number;
  details: Record<string, unknown>;
};

const STREET_SUFFIX_CANONICAL: Array<[RegExp, string]> = [
  [/\bct\b/g, "court"],
  [/\bdr\b/g, "drive"],
  [/\bst\b/g, "street"],
  [/\brd\b/g, "road"],
  [/\bave\b/g, "avenue"],
  [/\bblvd\b/g, "boulevard"],
  [/\bhwy\b/g, "highway"],
  [/\bln\b/g, "lane"],
];

function isPrismaConnectivityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("connect") ||
    message.includes("connection") ||
    message.includes("timed out") ||
    message.includes("can't reach database")
  );
}

function scoreSuggestion(address: string, query: string): number {
  const normalizedAddress = canonicalizeAddressLikeText(address);
  const normalizedQuery = canonicalizeAddressLikeText(query);
  if (!normalizedQuery) return 100;
  if (normalizedAddress === normalizedQuery) return 0;
  if (normalizedAddress.startsWith(normalizedQuery)) return 1;
  const words = normalizedAddress.split(" ").filter(Boolean);
  if (words.some((word) => word.startsWith(normalizedQuery))) return 2;
  if (normalizedAddress.includes(normalizedQuery)) return 3;
  return 10;
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseLimit(rawLimit: string | null): number | null {
  if (!rawLimit) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_LIMIT) return null;
  return parsed;
}

function computeCoordsFromBbox(row: Record<string, unknown>): [number, number] | null {
  const rawBbox = row.bbox;
  let bbox: unknown[] | null = null;
  if (Array.isArray(rawBbox) && rawBbox.length === 4) {
    bbox = rawBbox;
  } else if (typeof rawBbox === "string" && rawBbox.trim().length > 0) {
    try {
      const parsed = JSON.parse(rawBbox);
      if (Array.isArray(parsed) && parsed.length === 4) bbox = parsed;
    } catch {
      const csv = rawBbox.replace(/^\[|\]$/g, "").split(",").map((part) => part.trim());
      if (csv.length === 4) bbox = csv;
    }
  }
  if (!bbox) return null;
  const minLng = toFiniteNumberOrNull(bbox[0]);
  const minLat = toFiniteNumberOrNull(bbox[1]);
  const maxLng = toFiniteNumberOrNull(bbox[2]);
  const maxLat = toFiniteNumberOrNull(bbox[3]);
  if (minLng == null || minLat == null || maxLng == null || maxLat == null) return null;
  return [(minLat + maxLat) / 2, (minLng + maxLng) / 2];
}

function parseGeometryCentroid(value: unknown): [number, number] | null {
  if (typeof value === "string") {
    try {
      return parseGeometryCentroid(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const geometry = value as Record<string, unknown>;
  const coordinates = geometry.coordinates;
  if (!Array.isArray(coordinates)) return null;
  const points: Array<[number, number]> = [];
  const visit = (candidate: unknown): void => {
    if (!Array.isArray(candidate)) return;
    if (
      candidate.length >= 2 &&
      typeof candidate[0] === "number" &&
      typeof candidate[1] === "number"
    ) {
      points.push([candidate[1], candidate[0]]);
      return;
    }
    for (const next of candidate) visit(next);
  };
  visit(coordinates);
  if (points.length === 0) return null;
  const lat = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const lng = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  return [lat, lng];
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

function deriveAddressCentroid(value: unknown): [number, number] | null {
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
    if (lat != null && lng != null) return [lat, lng];
  }
  if (Array.isArray(value) && value.length >= 2) {
    const first = toFiniteNumberOrNull(value[0]);
    const second = toFiniteNumberOrNull(value[1]);
    if (first != null && second != null) return normalizeLatLngPair(first, second);
  }
  return null;
}

function normalizeRpcRows(value: unknown): Record<string, unknown>[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is Record<string, unknown> =>
        item !== null && typeof item === "object" && !Array.isArray(item),
    );
  }
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    for (const key of ["data", "rows", "result", "items", "parcels"]) {
      if (Array.isArray(object[key])) return normalizeRpcRows(object[key]);
    }
    if ("error" in object) return [];
    if (object.id != null || object.site_address != null || object.situs_address != null) {
      return [object];
    }
  }
  return [];
}

async function gatewaySearchParcels(q: string, limit: number): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  const response = await requestPropertyDbGateway({
    routeTag: "/api/parcels/search",
    path: `/api/parcels/search?${params.toString()}`,
    method: "GET",
    cache: "no-store",
    internalScope: "parcels.read",
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return [];
  }
  return normalizeRpcRows(payload);
}

async function searchGateway(
  query: string,
  limit: number,
): Promise<SuggestionRow[]> {
  const config = getPropertyDbConfigOrNull();
  if (!config) return [];
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  try {
    const res = await fetch(`${config.url}/api/parcels/search?${params}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.key}`,
        ...getPropertyDbScopeHeaders("parcels.read"),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as unknown;
    const data = Array.isArray(json)
      ? json
      : Array.isArray((json as Record<string, unknown>)?.data)
        ? ((json as Record<string, unknown>).data as unknown[])
        : [];
    return data
      .filter(
        (row): row is Record<string, unknown> =>
          row !== null && typeof row === "object" && !Array.isArray(row),
      )
      .map(mapGatewayRowToSuggestion)
      .filter((row): row is SuggestionRow => row !== null);
  } catch {
    return [];
  }
}

function buildGatewayQueryCandidates(input: string): string[] {
  const normalized = canonicalizeAddressLikeText(input);
  if (!normalized) return [];
  const tokens = normalized.split(" ").filter(Boolean);
  const nonZipTokens = tokens.filter((token) => !/^\d{5}(?:-\d{4})?$/.test(token));
  const nonLocationTokens = nonZipTokens.filter((token) => !LOCATION_STOP_WORDS.has(token));
  const withoutHouseNumber =
    nonLocationTokens[0] && /^\d+[a-z]*$/i.test(nonLocationTokens[0])
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

async function searchGatewayCandidates(query: string, limit: number): Promise<SuggestionRow[]> {
  const candidates = buildGatewayQueryCandidates(query).slice(0, 2);
  if (candidates.length === 0) return [];
  const results = await Promise.allSettled(candidates.map((candidate) => searchGateway(candidate, limit)));
  for (const result of results) {
    if (result.status === "fulfilled" && result.value.length > 0) return result.value;
  }
  return [];
}

function mapGatewayRowToSuggestion(row: Record<string, unknown>): SuggestionRow | null {
  const address = String(row.site_address ?? row.situs_address ?? row.address ?? "").trim();
  if (!address) return null;
  const rawParcelId = String(row.parcel_uid ?? row.parcel_id ?? row.apn ?? row.id ?? "").trim();
  const parcelId = normalizeParcelId(rawParcelId);
  const lat = toNumberOrNull(row.lat ?? row.latitude);
  const lng = toNumberOrNull(row.lng ?? row.longitude);
  return {
    id: parcelId ?? `pdb-${address}`,
    parcelId,
    address,
    lat,
    lng,
    propertyDbId: parcelId,
    hasGeometry: isEastBatonRougeCoordinate(lat, lng),
    owner:
      row.owner != null
        ? String(row.owner)
        : row.owner_name != null
          ? String(row.owner_name)
          : row.taxpayer_name != null
            ? String(row.taxpayer_name)
            : null,
    source: "property_db",
  };
}

function buildExactGatewaySearchTerms(rawText: string): string[] {
  const trimmed = rawText.trim().replace(/\s+/g, " ");
  if (!trimmed) return [];
  const normalized = sanitizeSearchInput(trimmed);
  if (!normalized) return [];
  const tokens = normalized.split(" ").filter(Boolean);
  const out = new Set<string>([trimmed, normalized]);
  if (tokens.length >= 3) out.add(tokens.slice(0, 3).join(" "));
  if (tokens.length >= 2) {
    out.add(tokens.slice(0, 2).join(" "));
    out.add(tokens.slice(-2).join(" "));
  }
  return Array.from(out).filter((value) => value.length >= 2);
}

function buildGatewaySearchTerms(rawText: string): string[] {
  const normalized = canonicalizeAddressLikeText(rawText);
  if (!normalized) return [];
  const tokens = normalized.split(" ").filter(Boolean);
  const nonZipTokens = tokens.filter((token) => !/^\d{5}(?:-\d{4})?$/.test(token));
  const nonLocationTokens = nonZipTokens.filter((token) => !LOCATION_STOP_WORDS.has(token));
  const withoutHouseNumber =
    nonLocationTokens[0] && /^\d+[a-z]*$/i.test(nonLocationTokens[0])
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

function buildPrioritizedGatewayQueries(rawText: string): string[] {
  const orderedQueries = [...buildExactGatewaySearchTerms(rawText), ...buildGatewaySearchTerms(rawText)];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of orderedQueries) {
    const trimmed = candidate.trim();
    if (!trimmed || trimmed === "*") continue;
    const key = sanitizeSearchInput(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function matchesSearchQuery(parcel: ParcelApiRecord, query: string): boolean {
  if (!query) return true;
  const normalizedQuery = canonicalizeAddressLikeText(query);
  const canonicalFields = [
    parcel.address,
    parcel.searchText,
    parcel.currentZoning,
    parcel.floodZone,
    parcel.parcelId,
    parcel.propertyDbId,
  ]
    .filter((value): value is string => typeof value === "string")
    .map((value) => canonicalizeAddressLikeText(value))
    .filter(Boolean);
  if (canonicalFields.some((value) => value.includes(normalizedQuery))) return true;
  const tokenMatches = normalizedQuery
    .split(" ")
    .map((token) => token.trim())
    .filter(
      (token) => token.length >= 2 && !/^\d{5}(?:-\d{4})?$/.test(token) && !LOCATION_STOP_WORDS.has(token),
    );
  if (tokenMatches.length === 0) return false;
  return tokenMatches.every((token) => canonicalFields.some((field) => field.includes(token)));
}

function parcelDedupKey(parcel: ParcelApiRecord): string {
  const parcelId = typeof parcel.parcelId === "string" ? normalizeParcelId(parcel.parcelId) : null;
  if (parcelId) return `parcelId:${parcelId}`;
  const propertyDbId = typeof parcel.propertyDbId === "string" ? normalizeParcelId(parcel.propertyDbId) : null;
  if (propertyDbId) return `propertyDbId:${propertyDbId}`;
  const address = typeof parcel.address === "string" ? canonicalizeAddressLikeText(parcel.address) : "";
  if (address) return `address:${address}`;
  const id = typeof parcel.id === "string" ? parcel.id.trim() : "";
  if (id) return `id:${id}`;
  const lat = typeof parcel.lat === "number" ? parcel.lat.toFixed(6) : "";
  const lng = typeof parcel.lng === "number" ? parcel.lng.toFixed(6) : "";
  return `coords:${lat}:${lng}`;
}

function mergeParcelResults(primary: ParcelApiRecord[], secondary: ParcelApiRecord[]): ParcelApiRecord[] {
  const merged = new Map<string, ParcelApiRecord>();
  for (const parcel of primary) merged.set(parcelDedupKey(parcel), parcel);
  for (const parcel of secondary) {
    const key = parcelDedupKey(parcel);
    if (!merged.has(key)) merged.set(key, parcel);
  }
  return Array.from(merged.values());
}

function normalizeOrgParcel(parcel: ParcelApiRecord): ParcelApiRecord | null {
  const lat = typeof parcel.lat === "number" ? parcel.lat : null;
  const lng = typeof parcel.lng === "number" ? parcel.lng : null;
  if (!isEastBatonRougeCoordinate(lat, lng)) return null;
  const rawPropertyDbId = typeof parcel.propertyDbId === "string" ? parcel.propertyDbId.trim() : null;
  const rawGeometryLookupKey =
    typeof parcel.geometryLookupKey === "string" ? parcel.geometryLookupKey.trim() : null;
  const parcelId = normalizeParcelId(rawPropertyDbId ?? rawGeometryLookupKey ?? (typeof parcel.id === "string" ? parcel.id : null));
  if (!parcelId) return null;
  return {
    ...parcel,
    id: parcelId,
    parcelId,
    propertyDbId: rawPropertyDbId ?? parcelId,
    geometryLookupKey: rawGeometryLookupKey ?? rawPropertyDbId ?? parcelId,
    hasGeometry: true,
  };
}

async function fetchOrgFallbackParcels(orgId: string, searchText: string): Promise<ParcelApiRecord[]> {
  const parcels = await prismaRead.parcel.findMany({
    where: { orgId },
    include: {
      deal: { select: { id: true, name: true, sku: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const withCoords = (parcels as ParcelApiRecord[])
    .map(normalizeOrgParcel)
    .filter((parcel): parcel is ParcelApiRecord => parcel !== null);
  if (!searchText) return withCoords.slice(0, 500);
  const filtered = withCoords.filter((parcel) => matchesSearchQuery(parcel, searchText));
  return (filtered.length > 0 ? filtered : withCoords).slice(0, 500);
}

function mapExternalParcelToApiShape(row: Record<string, unknown>): ParcelApiRecord | null {
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
  const lat =
    toFiniteNumberOrNull(row.latitude ?? row.lat) ??
    toFiniteNumberOrNull(row.geom_y) ??
    toFiniteNumberOrNull(row.y) ??
    toFiniteNumberOrNull(row.centroid_lat) ??
    fallbackCoords?.[0] ??
    null;
  const lng =
    toFiniteNumberOrNull(row.longitude ?? row.lng) ??
    toFiniteNumberOrNull(row.geom_x) ??
    toFiniteNumberOrNull(row.x) ??
    toFiniteNumberOrNull(row.centroid_lng) ??
    fallbackCoords?.[1] ??
    null;
  if (!isEastBatonRougeCoordinate(lat, lng)) return null;

  const rawParcelId = String(row.parcel_uid ?? row.parcel_id ?? row.apn ?? row.id ?? "").trim();
  const parcelId = normalizeParcelId(rawParcelId);
  if (!parcelId) return null;
  const address = String(row.site_address ?? row.situs_address ?? row.address ?? "Unknown");
  return {
    id: parcelId,
    parcelId,
    address,
    lat,
    lng,
    owner:
      row.owner != null
        ? String(row.owner)
        : row.owner_name != null
          ? String(row.owner_name)
          : row.taxpayer_name != null
            ? String(row.taxpayer_name)
            : null,
    acreage: row.acreage != null ? Number(row.acreage) : null,
    floodZone: row.flood_zone ? String(row.flood_zone) : null,
    currentZoning:
      row.zoning != null
        ? String(row.zoning)
        : row.zoning_type != null
          ? String(row.zoning_type)
          : row.zone_code != null
            ? String(row.zone_code)
            : null,
    propertyDbId: rawParcelId || parcelId,
    geometryLookupKey: rawParcelId || parcelId,
    hasGeometry: true,
    searchText: canonicalizeAddressLikeText(address),
    deal: null,
  };
}

async function runGatewayFallbackQueries(
  tasks: Array<() => Promise<Record<string, unknown>[]>>,
  stopOnFirstNonEmpty: boolean,
): Promise<Record<string, unknown>[][]> {
  if (stopOnFirstNonEmpty) {
    const successful: Record<string, unknown>[][] = [];
    let firstGatewayError: PropertyDbGatewayError | null = null;
    for (const task of tasks) {
      try {
        const rows = await task();
        successful.push(rows);
        if (rows.length > 0) return successful;
      } catch (error) {
        if (!firstGatewayError && error instanceof PropertyDbGatewayError) firstGatewayError = error;
      }
    }
    if (successful.length === 0 && firstGatewayError) throw firstGatewayError;
    return successful;
  }

  const settled = await Promise.allSettled(tasks.map((task) => task()));
  const successful: Record<string, unknown>[][] = [];
  let firstGatewayError: PropertyDbGatewayError | null = null;
  for (const result of settled) {
    if (result.status === "fulfilled") successful.push(result.value);
    if (result.status === "rejected" && !firstGatewayError && result.reason instanceof PropertyDbGatewayError) {
      firstGatewayError = result.reason;
    }
  }
  if (successful.length === 0 && firstGatewayError) throw firstGatewayError;
  return successful;
}

export async function searchParcelsForRoute(input: {
  orgId: string;
  hasCoords: boolean;
  searchText: string;
}): Promise<ParcelRouteServiceResult> {
  const hasSearch = input.searchText.length > 0;
  const requiresGateway = input.hasCoords || hasSearch;
  const baseDetails = {
    hasCoords: input.hasCoords,
    hasSearch,
    searchLength: input.searchText.length,
    requiresGateway,
  };

  if (!requiresGateway) {
    try {
      const parcels = await prismaRead.parcel.findMany({
        where: { orgId: input.orgId },
        include: { deal: { select: { id: true, name: true, sku: true, status: true } } },
        orderBy: { createdAt: "desc" },
        take: 500,
      });
      const normalized = (parcels as ParcelApiRecord[])
        .map(normalizeOrgParcel)
        .filter((parcel): parcel is ParcelApiRecord => parcel !== null);
      return {
        status: 200,
        body: { parcels: normalized, source: "org" },
        upstream: "org",
        resultCount: normalized.length,
        details: { ...baseDetails, source: "org" },
      };
    } catch (error) {
      if (isPrismaConnectivityError(error)) {
        return {
          status: 503,
          body: { error: "Parcel store unavailable", code: "ORG_DATA_UNAVAILABLE" },
          upstream: "org",
          resultCount: 0,
          details: { ...baseDetails, source: "org", reason: "prisma_unavailable" },
        };
      }
      return {
        status: 500,
        body: { error: "Failed to fetch parcels" },
        upstream: "org",
        resultCount: 0,
        details: baseDetails,
      };
    }
  }

  let orgSearchMatches: ParcelApiRecord[] = [];
  if (hasSearch) {
    try {
      orgSearchMatches = await fetchOrgFallbackParcels(input.orgId, input.searchText);
    } catch {
      orgSearchMatches = [];
    }
  }

  const fallbackQueries = hasSearch
    ? buildPrioritizedGatewayQueries(input.searchText)
        .filter((term) => term.trim().length > 0 && term.trim() !== "*")
        .slice(0, MAX_SEARCH_VARIANT_QUERIES)
        .map(
          (term, index) => () => gatewaySearchParcels(term, index === 0 ? 30 : 20),
        )
    : [() => gatewaySearchParcels("*", BASELINE_GATEWAY_RESULT_LIMIT)].slice(
        0,
        MAX_BASELINE_FALLBACK_QUERIES,
      );
  const fallbackQueryCount = fallbackQueries.length;

  try {
    const parishResults = await runGatewayFallbackQueries(fallbackQueries, hasSearch);
    const externalRows = parishResults.flat();
    if (externalRows.length === 0) {
      if (orgSearchMatches.length > 0) {
        return {
          status: 200,
          body: {
            parcels: orgSearchMatches.slice(0, 500),
            source: "org",
            degraded: true,
            warning: "Property DB search returned no matches; returning org-scoped parcel matches.",
          },
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
        };
      }
      return {
        status: 200,
        body: {
          parcels: [],
          source: "property-db",
          error: hasSearch
            ? "No matches found for the provided search terms."
            : "No parcels found in this region.",
        },
        upstream: "property-db",
        resultCount: 0,
        details: {
          ...baseDetails,
          source: "property-db",
          fallbackQueryCount,
          externalRowCount: 0,
          emptyResult: true,
        },
      };
    }

    const mappedExternal = externalRows
      .map((row) => mapExternalParcelToApiShape(row))
      .filter((row): row is ParcelApiRecord => row !== null);
    const filteredExternal = hasSearch
      ? mappedExternal.filter((parcel) => matchesSearchQuery(parcel, input.searchText))
      : mappedExternal;
    const deduped = mergeParcelResults(filteredExternal, orgSearchMatches).slice(0, 500);
    const batonRougeDeduped = deduped.filter((parcel) => {
      const lat = typeof parcel.lat === "number" ? parcel.lat : null;
      const lng = typeof parcel.lng === "number" ? parcel.lng : null;
      if (isEastBatonRougeCoordinate(lat, lng)) return true;
      return isBatonRougeScopedText(typeof parcel.address === "string" ? parcel.address : null);
    });

    return {
      status: 200,
      body: { parcels: batonRougeDeduped, source: "property-db" },
      cacheControl: "private, max-age=30, stale-while-revalidate=120",
      upstream: "property-db",
      resultCount: batonRougeDeduped.length,
      details: {
        ...baseDetails,
        source: "property-db",
        fallbackQueryCount,
        externalRowCount: externalRows.length,
        mappedCount: mappedExternal.length,
        filteredCount: filteredExternal.length,
        orgSearchMatchCount: orgSearchMatches.length,
        dedupedCount: batonRougeDeduped.length,
      },
    };
  } catch (error) {
    if (error instanceof PropertyDbGatewayError) {
      try {
        const orgFallback = await fetchOrgFallbackParcels(input.orgId, input.searchText);
        return {
          status: 200,
          body: {
            parcels: orgFallback,
            source: "org-fallback",
            degraded: true,
            warning: "Property database unavailable; returned org-scoped fallback parcels.",
          },
          upstream: "org-fallback",
          resultCount: orgFallback.length,
          details: {
            ...baseDetails,
            fallbackQueryCount,
            source: "org-fallback",
            degraded: true,
            gatewayUnavailable: true,
          },
        };
      } catch {
        return {
          status: error.status ?? 503,
          body: { error: "Property database unavailable", code: "GATEWAY_UNAVAILABLE" },
          upstream: "property-db",
          resultCount: 0,
          details: { ...baseDetails, fallbackQueryCount, gatewayConfigured: false },
        };
      }
    }

    return {
      status: 500,
      body: { error: "Failed to fetch parcels" },
      upstream: requiresGateway ? "property-db" : "org",
      resultCount: 0,
      details: baseDetails,
    };
  }
}

export async function suggestParcelsForRoute(input: {
  orgId: string;
  query: string;
  rawLimit: string | null;
}): Promise<ParcelRouteServiceResult> {
  const limit = parseLimit(input.rawLimit);
  if (limit == null) {
    return {
      status: 400,
      body: { error: "Invalid limit" },
      upstream: "org",
      resultCount: 0,
      details: { validationError: "invalid_limit" },
    };
  }
  if (input.query.length < 2) {
    return {
      status: 200,
      body: { suggestions: [] },
      upstream: "org",
      resultCount: 0,
      details: { queryLength: input.query.length, limit },
    };
  }

  const normalizedQuery = canonicalizeAddressLikeText(input.query);
  const queryVariants = Array.from(new Set([input.query, normalizedQuery].map((value) => value.trim()).filter(Boolean)));
  const prefixRows = await prismaRead.parcel.findMany({
    where: {
      orgId: input.orgId,
      OR: queryVariants.map((value) => ({ address: { startsWith: value, mode: "insensitive" as const } })),
    },
    select: { id: true, address: true, lat: true, lng: true, propertyDbId: true },
    take: Math.min(limit * 4, 80),
  });

  const seenIds = new Set(prefixRows.map((row) => row.id));
  const containsRows =
    prefixRows.length === 0
      ? await prismaRead.parcel.findMany({
          where: {
            orgId: input.orgId,
            id: { notIn: Array.from(seenIds) },
            OR: queryVariants.map((value) => ({ address: { contains: value, mode: "insensitive" as const } })),
          },
          select: { id: true, address: true, lat: true, lng: true, propertyDbId: true },
          take: Math.min(limit * 2, 40),
        })
      : [];

  const orgRows: SuggestionRow[] = Array.from(
    new Map([...prefixRows, ...containsRows].map((row) => [row.id, row])).values(),
  )
    .filter((row) => typeof row.address === "string" && row.address.trim().length > 0)
    .map((row) => {
      const parcelId = normalizeParcelId((row.propertyDbId as string | null) ?? row.id);
      const lat = toNumberOrNull(row.lat);
      const lng = toNumberOrNull(row.lng);
      return {
        id: parcelId ?? row.id,
        parcelId,
        address: row.address,
        lat,
        lng,
        propertyDbId: parcelId,
        hasGeometry: isEastBatonRougeCoordinate(lat, lng),
        source: "org",
      };
    });

  let gatewayRows: SuggestionRow[] = [];
  if (orgRows.length === 0) {
    gatewayRows = await searchGatewayCandidates(input.query, Math.min(limit * 3, 30));
  }

  const allowOutOfRegion = isExplicitOutOfRegionQuery(input.query);
  const allRows = [...orgRows, ...gatewayRows];
  const filteredRows = allRows.filter((row) => {
    if (!row.parcelId || !row.hasGeometry) return false;
    if (allowOutOfRegion) return true;
    if (isEastBatonRougeCoordinate(row.lat, row.lng)) return true;
    return isBatonRougeScopedText(row.address) || isBatonRougeScopedText(row.owner);
  });
  const suggestions = filteredRows
    .map((row) => ({ ...row, score: scoreSuggestion(row.address, input.query) }))
    .sort((a, b) => a.score - b.score || a.address.localeCompare(b.address))
    .slice(0, limit)
    .map(({ score: _score, ...rest }) => rest);

  return {
    status: 200,
    body: { suggestions },
    cacheControl: "private, max-age=15, stale-while-revalidate=60",
    upstream: orgRows.length > 0 ? "org" : "property-db",
    resultCount: suggestions.length,
    details: {
      query: input.query,
      limit,
      allowOutOfRegion,
      acceptedCount: suggestions.length,
      suppressedCount: allRows.length - filteredRows.length,
    },
  };
}
