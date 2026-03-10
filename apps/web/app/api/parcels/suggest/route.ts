import { NextRequest, NextResponse } from "next/server";
import { prismaRead } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  attachRequestIdHeader,
  createRequestObservabilityContext,
} from "@/lib/server/observability";
import {
  getCloudflareAccessHeadersFromEnv,
  getPropertyDbConfigOrNull,
} from "@/lib/server/propertyDbEnv";

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
const GATEWAY_TIMEOUT_MS = 4000;
const LOCATION_STOP_WORDS = new Set([
  "baton",
  "rouge",
  "louisiana",
  "la",
  "usa",
  "united",
  "states",
]);

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
  let value = input
    .toLowerCase()
    .replace(/[^\w\s#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [pattern, replacement] of STREET_SUFFIX_CANONICAL) {
    value = value.replace(pattern, replacement);
  }
  return value.replace(/\s+/g, " ").trim();
}

function parseLimit(rawLimit: string | null): number | null {
  if (!rawLimit) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_LIMIT) return null;
  return parsed;
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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

function buildGatewayQueryCandidates(input: string): string[] {
  const normalized = canonicalizeAddressLikeText(input);
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

type GatewayRow = Record<string, unknown>;

type SuggestionRow = {
  id: string;
  address: string;
  lat: number | null;
  lng: number | null;
  propertyDbId: string | null;
  source?: "org" | "property_db";
};

function mapGatewayRowToSuggestion(row: GatewayRow): SuggestionRow | null {
  const address = String(
    row.site_address ?? row.situs_address ?? row.address ?? "",
  ).trim();
  if (!address) return null;

  const propertyDbId = String(
    row.parcel_uid ?? row.parcel_id ?? row.apn ?? row.id ?? "",
  ).trim();

  const lat = toNumberOrNull(row.lat ?? row.latitude);
  const lng = toNumberOrNull(row.lng ?? row.longitude);

  return {
    id: propertyDbId ? `pdb-${propertyDbId}` : `pdb-${address}`,
    address,
    lat,
    lng,
    propertyDbId: propertyDbId || null,
    source: "property_db",
  };
}

async function searchGateway(
  query: string,
  limit: number,
): Promise<SuggestionRow[]> {
  const config = getPropertyDbConfigOrNull();
  if (!config) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);
  try {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    const res = await fetch(`${config.url}/api/parcels/search?${params}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.key}`,
        ...getCloudflareAccessHeadersFromEnv(),
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as unknown;
    if (!json || typeof json !== "object") return [];
    const data = Array.isArray(json)
      ? json
      : Array.isArray((json as Record<string, unknown>).data)
        ? (json as Record<string, unknown>).data as unknown[]
        : [];
    return data
      .filter((row): row is GatewayRow => row != null && typeof row === "object")
      .map(mapGatewayRowToSuggestion)
      .filter((row): row is SuggestionRow => row !== null);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function searchGatewayCandidates(
  query: string,
  limit: number,
): Promise<SuggestionRow[]> {
  const candidates = buildGatewayQueryCandidates(query).slice(0, 2);
  if (candidates.length === 0) return [];

  // Fire candidates in parallel — return the first non-empty result set.
  const results = await Promise.allSettled(
    candidates.map((candidate) => searchGateway(candidate, limit)),
  );
  for (const result of results) {
    if (result.status === "fulfilled" && result.value.length > 0) {
      return result.value;
    }
  }
  return [];
}

export async function GET(request: NextRequest) {
  const context = createRequestObservabilityContext(request, "/api/parcels/suggest");
  const withRequestId = (response: NextResponse) =>
    attachRequestIdHeader(response, context.requestId);

  const auth = await resolveAuth(request);
  if (!auth) {
    return withRequestId(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }
  if (!auth.orgId) {
    return withRequestId(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  if (limit == null) {
    return withRequestId(NextResponse.json({ error: "Invalid limit" }, { status: 400 }));
  }

  if (query.length < 2) {
    return withRequestId(NextResponse.json({ suggestions: [] }));
  }

  const normalizedQuery = canonicalizeAddressLikeText(query);
  const queryVariants = Array.from(
    new Set([query, normalizedQuery].map((value) => value.trim()).filter(Boolean)),
  );

  const prefixRows = await prismaRead.parcel.findMany({
    where: {
      orgId: auth.orgId,
      OR: [
        ...queryVariants.map((value) => ({
          address: { startsWith: value, mode: "insensitive" as const },
        })),
      ],
    },
    select: {
      id: true,
      address: true,
      lat: true,
      lng: true,
      propertyDbId: true,
    },
    take: Math.min(limit * 4, 80),
  });

  const seenIds = new Set(prefixRows.map((row) => row.id));
  const needsContainsFallback = prefixRows.length === 0;
  const containsRows = needsContainsFallback
    ? await prismaRead.parcel.findMany({
        where: {
          orgId: auth.orgId,
          id: { notIn: Array.from(seenIds) },
          OR: [
            ...queryVariants.map((value) => ({
              address: { contains: value, mode: "insensitive" as const },
            })),
          ],
        },
        select: {
          id: true,
          address: true,
          lat: true,
          lng: true,
          propertyDbId: true,
        },
        take: Math.min(limit * 2, 40),
      })
    : [];

  const orgRows: SuggestionRow[] = Array.from(
    new Map([...prefixRows, ...containsRows].map((row) => [row.id, row])).values(),
  )
    .filter((row) => typeof row.address === "string" && row.address.trim().length > 0)
    .map((row) => ({
      id: row.id,
      address: row.address,
      lat: toNumberOrNull(row.lat),
      lng: toNumberOrNull(row.lng),
      propertyDbId: row.propertyDbId,
      source: "org" as const,
    }));

  // Gateway fallback: when org-local results are empty, search the property DB
  let gatewayRows: SuggestionRow[] = [];
  if (orgRows.length === 0) {
    gatewayRows = await searchGatewayCandidates(query, Math.min(limit * 3, 30));
  }

  const allRows = [...orgRows, ...gatewayRows];

  const suggestions = allRows
    .map((row) => ({
      ...row,
      score: scoreSuggestion(row.address, query),
    }))
    .sort((a, b) => a.score - b.score || a.address.localeCompare(b.address))
    .slice(0, limit)
    .map(({ score: _score, ...rest }) => rest);

  const response = NextResponse.json({ suggestions });
  response.headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=60");
  return withRequestId(response);
}
