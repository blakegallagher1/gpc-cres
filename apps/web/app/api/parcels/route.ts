import { NextRequest, NextResponse } from "next/server";
import { prismaRead } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { logPropertyDbRuntimeHealth, requirePropertyDbConfig } from "@/lib/server/propertyDbEnv";
import {
  getDevFallbackParcels,
  isDevParcelFallbackEnabled,
  isPrismaConnectivityError,
} from "@/lib/server/devParcelFallback";

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

async function propertyRpc(
  fnName: string,
  body: Record<string, unknown>,
): Promise<unknown[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const { url, key } = requirePropertyDbConfig("parcels-route");
    const res = await fetch(`${url}/rest/v1/rpc/${fnName}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return [];
    let parsed: unknown[] = [];
    let text = "";
    try {
      text = await res.text();
      if (text) {
        parsed = parseRpcResponseArray(text);
        if (parsed.length > 0) {
          return parsed;
        }
      }
    } catch (textError) {
      console.error("Failed reading parcel rpc text response", textError);
    }

    try {
      const fallback = text ? await res.clone().json() : await res.json();
      const fallbackRows = normalizeRpcRows(fallback);
      if (fallbackRows.length > 0) {
        return fallbackRows;
      }
    } catch {
      // ignore; fallback response may only be text
    }

    return [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function buildRpcSearchTerms(rawText: string): string[] {
  const normalized = canonicalizeAddressLikeText(rawText);
  if (!normalized) return ["*"];

  const terms = new Set<string>([
    rawText.trim(),
    normalized,
    normalized.toLowerCase(),
    normalized.toUpperCase(),
    ...normalizeParcelCandidate(normalized),
  ]);
  return Array.from(terms).filter(Boolean);
}

function mergeRpcResultRows(values: unknown[][]): Record<string, unknown>[] {
  const deduped = new Map<string, Record<string, unknown>>();

  for (const rows of values) {
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const record = row as Record<string, unknown>;
      const normalizedId = String(
        record.id ??
          record.parcel_uid ??
          record.parcel_id ??
          record.parcel_number ??
          record.property_id ??
          `${record.site_address ?? ""}-${record.latitude ?? ""}-${record.longitude ?? ""}`,
      );
      if (!deduped.has(normalizedId)) {
        deduped.set(normalizedId, record);
      }
    }
  }

  return Array.from(deduped.values());
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
    currentZoning: row.zoning ? String(row.zoning) : row.zone_code ? String(row.zone_code) : null,
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
  const searchText = String(parcel.searchText ?? "");
  const fields = [
    parcel.address,
    searchText,
    parcel.currentZoning,
    parcel.floodZone,
    parcel.propertyDbId,
  ];
  return fields.some((value) =>
    typeof value === "string" &&
    canonicalizeAddressLikeText(value).includes(q),
  );
}

async function searchPropertyDbParcels(
  searchText: string,
  parish?: string,
  limitRows: number = 120,
): Promise<unknown[]> {
  const fallback = searchText.trim().length > 0 ? searchText.trim() : "*";
  const candidates = buildRpcSearchTerms(fallback);
  const limit = Math.max(80, Math.min(limitRows, 250));

  const searchCalls: Array<() => Promise<unknown[]>> = [];
  const addSearchCalls = (query: string, withAltNames = true) => {
    searchCalls.push(
      () => propertyRpc("api_search_parcels", {
        search_text: query,
        ...(parish ? { parish } : {}),
        limit_rows: limit,
      }),
      () => propertyRpc("api_search_parcels", {
        p_search_text: query,
        ...(parish ? { p_parish: parish } : {}),
        p_limit: limit,
      }),
    );

    if (withAltNames) {
      searchCalls.push(
        () => propertyRpc("api_search_parcels", {
          search_query: query,
          ...(parish ? { parish } : {}),
          limit_rows: limit,
        }),
        () => propertyRpc("api_search_parcels", {
          q: query,
          ...(parish ? { parish } : {}),
          p_limit: limit,
        }),
        () => propertyRpc("api_search_parcels", {
          query: query,
          ...(parish ? { parish } : {}),
          limit: limit,
        }),
        () => propertyRpc("api_search_parcels", {
          query_text: query,
          ...(parish ? { parish } : {}),
          limit_rows: limit,
        }),
        () => propertyRpc("api_search_parcels", {
          search_term: query,
          ...(parish ? { parish } : {}),
          limit_rows: limit,
        }),
      );
    }
  };

  for (const candidate of candidates) {
    if (candidate) {
      addSearchCalls(candidate);
    }
  }

  if (fallback !== "*") {
    addSearchCalls(fallback.toLowerCase(), false);
    addSearchCalls(fallback.toUpperCase(), false);
    searchCalls.push(() => propertyRpc("api_get_parcel", { parcel_id: fallback }));
  }

  const settled = await runWithConcurrency(searchCalls, 5);
  const results = settled
    .filter(
      (result): result is PromiseFulfilledResult<unknown[]> =>
        result.status === "fulfilled",
    )
    .map((result) => result.value);
  return mergeRpcResultRows(results);
}

// GET /api/parcels - list parcels across all deals
export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hasCoords = request.nextUrl.searchParams.get("hasCoords") === "true";
    const searchText = request.nextUrl.searchParams.get("search")?.trim() ?? "";

    const where: Record<string, unknown> = { orgId: auth.orgId };
    if (hasCoords) {
      where.lat = { not: null };
      where.lng = { not: null };
    }
    if (searchText) {
    where.OR = [
        { address: { contains: searchText, mode: "insensitive" } },
        { currentZoning: { contains: searchText, mode: "insensitive" } },
        { floodZone: { contains: searchText, mode: "insensitive" } },
        {
          deal: {
            is: {
              name: { contains: searchText, mode: "insensitive" },
            },
          },
        },
      ];
    }

    let parcels: unknown[] = [];
    let prismaUnavailable = false;
    try {
      parcels = await prismaRead.parcel.findMany({
        where,
        include: {
          deal: {
            select: { id: true, name: true, sku: true, status: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      });
    } catch (error) {
      prismaUnavailable = isPrismaConnectivityError(error);
      if (!prismaUnavailable) {
        throw error;
      }
      console.warn("[/api/parcels] prisma unavailable, using fallbacks");
    }

    if (parcels.length > 0 || (!hasCoords && !prismaUnavailable)) {
      logParcelsDevPayload("org", {
        hasCoords,
        searchText,
        prismaUnavailable,
        parcelCount: parcels.length,
      });
      return NextResponse.json({ parcels, source: "org" });
    }

    const fallbackQueries: Array<() => Promise<unknown[]>> = searchText
      ? Array.from(
          new Set([...buildSearchTerms(searchText), ...normalizeParcelCandidate(searchText)]),
        ).flatMap((term) => [
          () => searchPropertyDbParcels(term, undefined, 180),
          ...PROPERTY_DB_PARISHES.map((parish) =>
            () => searchPropertyDbParcels(term, parish, 120),
          ),
        ])
      : [
          ...PROPERTY_DB_PARISHES.map((parish) =>
            () => searchPropertyDbParcels("*", parish, 150),
          ),
          ...PROPERTY_DB_SEARCH_TERMS.map((term) =>
            () => searchPropertyDbParcels(term, undefined, 200),
          ),
          () => searchPropertyDbParcels("*", undefined, 200),
        ];

    logPropertyDbRuntimeHealth("/api/parcels");

    const parishResults = (await runWithConcurrency(fallbackQueries, 5))
      .filter(
        (result): result is PromiseFulfilledResult<unknown[]> =>
          result.status === "fulfilled",
      )
      .map((result) => result.value);

    const externalRows = parishResults.flat();
    if (externalRows.length === 0) {
      if (isDevParcelFallbackEnabled()) {
        const matchedDevParcels = getDevFallbackParcels(searchText);
        const seed = matchedDevParcels.length > 0
          ? matchedDevParcels
          : getDevFallbackParcels("*");
        const devParcels = seed.map((parcel) => ({
          id: parcel.id,
          address: parcel.address,
          lat: parcel.lat,
          lng: parcel.lng,
          acreage: parcel.acreage,
          floodZone: parcel.floodZone,
          currentZoning: parcel.zoning,
          propertyDbId: parcel.propertyDbId,
          deal: null,
        }));
        logParcelsDevPayload("dev-fallback", {
          hasCoords,
          searchText,
          reason: "external_rows_empty",
          matchedDevCount: matchedDevParcels.length,
          parcelCount: devParcels.length,
        });
        return NextResponse.json({
          parcels: devParcels,
          source: "dev-fallback",
          searchFallback: Boolean(searchText) && matchedDevParcels.length === 0,
        });
      }
      logParcelsDevPayload("property-db-empty", {
        hasCoords,
        searchText,
        externalRowCount: 0,
      });
      return NextResponse.json({
        parcels: [],
        source: "property-db-fallback",
        error: searchText
          ? "No matches found for the provided search terms."
          : "No parcels found in this region.",
      });
    }

    const mappedExternal = externalRows
      .map((row) =>
        typeof row === "object" && row !== null
          ? mapExternalParcelToApiShape(row as Record<string, unknown>)
          : null,
      )
      .filter((row): row is Record<string, unknown> => row !== null);

    if (mappedExternal.length === 0 && isDevParcelFallbackEnabled()) {
      const matchedDevParcels = getDevFallbackParcels(searchText);
      const seed = matchedDevParcels.length > 0
        ? matchedDevParcels
        : getDevFallbackParcels("*");
      const devParcels = seed.map((parcel) => ({
        id: parcel.id,
        address: parcel.address,
        lat: parcel.lat,
        lng: parcel.lng,
        acreage: parcel.acreage,
        floodZone: parcel.floodZone,
        currentZoning: parcel.zoning,
        propertyDbId: parcel.propertyDbId,
        deal: null,
      }));
      logParcelsDevPayload("dev-fallback", {
        hasCoords,
        searchText,
        reason: "mapped_external_empty",
        externalRowCount: externalRows.length,
        matchedDevCount: matchedDevParcels.length,
        parcelCount: devParcels.length,
      });
      return NextResponse.json({
        parcels: devParcels,
        source: "dev-fallback",
        searchFallback: Boolean(searchText) && matchedDevParcels.length === 0,
      });
    }

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
          return preFiltered.length > 0 ? preFiltered : mappedExternal;
        })()
      : mappedExternal;

    const deduped = Array.from(
      new Map(filteredExternal.map((item) => [String(item.id), item])).values(),
    ).slice(0, 500);

    logParcelsDevPayload("property-db-fallback", {
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
        ((parcel as { propertyDbId: string }).propertyDbId).trim().length > 0
      ).length,
    });

    return NextResponse.json({ parcels: deduped, source: "property-db-fallback" });
  } catch (error) {
    console.error("Error fetching parcels:", error);
    return NextResponse.json(
      { error: "Failed to fetch parcels" },
      { status: 500 }
    );
  }
}
