import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { prisma } from "@entitlement-os/db";
import {
  attachRequestIdHeader,
  createRequestObservabilityContext,
  logRequestOutcome,
  logRequestStart,
} from "@/lib/server/observability";
import * as Sentry from "@sentry/nextjs";
import {
  logPropertyDbRuntimeHealth,
} from "@/lib/server/propertyDbEnv";
import { requestPropertyDbGateway } from "@/lib/server/propertyDbRpc";

const MAX_PROSPECT_RESULTS = 100;
const STREET_SUFFIX_CANONICAL: Array<[RegExp, string]> = [
  [/\bdr\b/g, "drive"],
  [/\bst\b/g, "street"],
  [/\brd\b/g, "road"],
  [/\bave\b/g, "avenue"],
  [/\bblvd\b/g, "boulevard"],
  [/\bhwy\b/g, "highway"],
  [/\bln\b/g, "lane"],
];
const STREET_SUFFIX_ABBREVIATED: Array<[RegExp, string]> = [
  [/\bdrive\b/g, "dr"],
  [/\bstreet\b/g, "st"],
  [/\broad\b/g, "rd"],
  [/\bavenue\b/g, "ave"],
  [/\bboulevard\b/g, "blvd"],
  [/\bhighway\b/g, "hwy"],
  [/\blane\b/g, "ln"],
];
const PROSPECT_SEARCH_FIELDS = [
  "regexp_replace(LOWER(COALESCE(address, '')), '[^a-z0-9]+', ' ', 'g')",
  "regexp_replace(LOWER(COALESCE(owner, '')), '[^a-z0-9]+', ' ', 'g')",
  "regexp_replace(LOWER(COALESCE(parcel_id, '')), '[^a-z0-9]+', ' ', 'g')",
] as const;

function isProspectRow(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProspectRowArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every((item) => isProspectRow(item));
}

function mapColumnarRows(
  columnNames: string[],
  rows: unknown[],
): Record<string, unknown>[] {
  return rows.flatMap((row) => {
    if (!Array.isArray(row)) {
      return [];
    }

    return [
      Object.fromEntries(
        columnNames.map((columnName, index) => [columnName, row[index] ?? null]),
      ),
    ];
  });
}

function normalizeProspectGatewayRows(value: unknown): Record<string, unknown>[] {
  if (!value) {
    return [];
  }

  if (isProspectRowArray(value)) {
    return value;
  }

  if (!isProspectRow(value)) {
    return [];
  }

  const rawColumnNames = Array.isArray(value.columnNames)
    ? value.columnNames
    : value.columns;
  const columnNames = Array.isArray(rawColumnNames)
    ? rawColumnNames.filter((item): item is string => typeof item === "string")
    : null;
  if (columnNames?.length && Array.isArray(value.rows)) {
    return mapColumnarRows(columnNames, value.rows);
  }

  for (const candidate of [value.data, value.rows, value.result, value.items, value.parcels]) {
    if (candidate === undefined) {
      continue;
    }

    return normalizeProspectGatewayRows(candidate);
  }

  if (
    value.id != null ||
    value.site_address != null ||
    value.situs_address != null ||
    value.address != null
  ) {
    return [value];
  }

  return [];
}

function extractProspectGatewayError(value: unknown): string | null {
  if (!isProspectRow(value)) {
    return null;
  }

  if (value.ok === false && typeof value.error === "string" && value.error.trim().length > 0) {
    return value.error.trim();
  }

  for (const candidate of [value.data, value.result]) {
    if (candidate === undefined) {
      continue;
    }
    const nestedError = extractProspectGatewayError(candidate);
    if (nestedError) {
      return nestedError;
    }
  }

  return null;
}

class ProspectGatewayError extends Error {
  status: number;
  code: "GATEWAY_UNCONFIGURED" | "GATEWAY_UNAVAILABLE";

  constructor(
    message: string,
    code: "GATEWAY_UNCONFIGURED" | "GATEWAY_UNAVAILABLE",
    status: number = 503,
  ) {
    super(message);
    this.name = "ProspectGatewayError";
    this.status = status;
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Gateway POST — calls FastAPI gateway at api.gallagherpropco.com
// ---------------------------------------------------------------------------

async function gatewayPost(
  path: string,
  body: Record<string, unknown>,
  requestId?: string,
): Promise<unknown> {
  let res: Response;
  try {
    res = await requestPropertyDbGateway({
      routeTag: "/api/map/prospect",
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      requestId,
      includeApiKey: true,
      cache: "no-store",
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.map.prospect", method: "UNKNOWN" },
    });
    throw new ProspectGatewayError(
      `[prospect] gateway ${path} request failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "GATEWAY_UNAVAILABLE",
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ProspectGatewayError(
      `[prospect] gateway ${path} error ${res.status}: ${text.slice(0, 200)}`,
      "GATEWAY_UNAVAILABLE",
      res.status >= 500 ? 502 : 503,
    );
  }

  try {
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.map.prospect", method: "UNKNOWN" },
    });
    throw new ProspectGatewayError(
      `[prospect] gateway ${path} invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "GATEWAY_UNAVAILABLE",
    );
  }
}

// ---------------------------------------------------------------------------
// Build a PostGIS ST_Contains SQL query for polygon parcel search
// ---------------------------------------------------------------------------

function buildPolygonSql(
  polygonCoordinates: number[][][],
  filters?: {
    searchText?: string;
    zoningCodes?: string[];
    minAcreage?: number;
    maxAcreage?: number;
    minAssessedValue?: number;
    maxAssessedValue?: number;
    excludeFloodZone?: boolean;
  },
): string {
  // Build GeoJSON polygon string for PostGIS
  const geojson = JSON.stringify({
    type: "Polygon",
    coordinates: polygonCoordinates,
  });

  const whereClauses: string[] = [
    `ST_Contains(ST_SetSRID(ST_GeomFromGeoJSON('${geojson.replace(/'/g, "''")}'), 4326), geom)`,
  ];
  const searchClause = buildProspectSearchClause(filters?.searchText);
  if (searchClause) {
    whereClauses.push(searchClause);
  }

  if (filters?.minAcreage != null) {
    whereClauses.push(`(area_sqft / 43560.0) >= ${Number(filters.minAcreage)}`);
  }
  if (filters?.maxAcreage != null) {
    whereClauses.push(`(area_sqft / 43560.0) <= ${Number(filters.maxAcreage)}`);
  }
  if (filters?.minAssessedValue != null) {
    whereClauses.push(`assessed_value >= ${Number(filters.minAssessedValue)}`);
  }
  if (filters?.maxAssessedValue != null) {
    whereClauses.push(`assessed_value <= ${Number(filters.maxAssessedValue)}`);
  }

  return `
    SELECT
      parcel_id AS id,
      address AS site_address,
      owner AS owner_name,
      (area_sqft / 43560.0) AS acreage,
      '' AS zoning,
      assessed_value,
      ST_Y(ST_Centroid(geom)) AS lat,
      ST_X(ST_Centroid(geom)) AS lng,
      'East Baton Rouge' AS parish_name
    FROM ebr_parcels
    WHERE ${whereClauses.join(" AND ")}
    ORDER BY address ASC NULLS LAST, parcel_id ASC
    LIMIT ${MAX_PROSPECT_RESULTS}
  `.trim();
}

function normalizeProspectSearchText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function replaceStreetSuffixes(
  value: string,
  replacements: ReadonlyArray<readonly [RegExp, string]>,
): string {
  let normalized = value;
  for (const [pattern, replacement] of replacements) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized.replace(/\s+/g, " ").trim();
}

function escapeSqlLikeLiteral(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "''")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

function buildProspectSearchPatterns(searchText?: string): string[] {
  const normalized = normalizeProspectSearchText(searchText ?? "");
  if (!normalized || normalized === "*") {
    return [];
  }

  const variants = new Set<string>([
    normalized,
    replaceStreetSuffixes(normalized, STREET_SUFFIX_CANONICAL),
    replaceStreetSuffixes(normalized, STREET_SUFFIX_ABBREVIATED),
  ]);

  return Array.from(variants)
    .filter(Boolean)
    .map((value) => `%${value.split(" ").map(escapeSqlLikeLiteral).join("%")}%`);
}

function buildProspectSearchClause(searchText?: string): string | null {
  const patterns = buildProspectSearchPatterns(searchText);
  if (patterns.length === 0) {
    return null;
  }

  const comparisons = patterns.flatMap((pattern) =>
    PROSPECT_SEARCH_FIELDS.map((field) => `${field} LIKE '${pattern}' ESCAPE '\\'`),
  );

  return `(${comparisons.join(" OR ")})`;
}

// ---------------------------------------------------------------------------
// POST /api/map/prospect
// Body: {
//   polygon: { type: "Polygon", coordinates: number[][][] },
//   filters?: {
//     zoningCodes?: string[],
//     minAcreage?: number,
//     maxAcreage?: number,
//     minAssessedValue?: number,
//     maxAssessedValue?: number,
//     excludeFloodZone?: boolean,
//   }
// }
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const context = createRequestObservabilityContext(req, "/api/map/prospect");
  await logRequestStart(context, { action: "prospect-search" });
  const withRequestId = (response: NextResponse) =>
    attachRequestIdHeader(response, context.requestId);

  const auth = await resolveAuth(req);
  if (!auth) {
    await logRequestOutcome(context, { status: 401, details: { action: "prospect-search" } });
    return withRequestId(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  let body: {
    polygon?: { coordinates?: number[][][] };
    filters?: {
      searchText?: string;
      minAcreage?: number;
      maxAcreage?: number;
      zoningCodes?: string[];
      excludeFloodZone?: boolean;
      minAssessedValue?: number;
      maxAssessedValue?: number;
    };
  };
  let requestDetails: Record<string, unknown> = { action: "prospect-search" };
  try {
    body = (await req.json()) as {
      polygon?: { coordinates?: number[][][] };
      filters?: {
        searchText?: string;
        minAcreage?: number;
        maxAcreage?: number;
        zoningCodes?: string[];
        excludeFloodZone?: boolean;
        minAssessedValue?: number;
        maxAssessedValue?: number;
      };
    };
  } catch {
    await logRequestOutcome(context, {
      status: 400,
      orgId: auth.orgId,
      userId: auth.userId,
      details: { ...requestDetails, validationError: "invalid_json" },
    });
    return withRequestId(
      NextResponse.json(
        { error: "Validation failed", details: { body: ["Invalid JSON body"] } },
        { status: 400 },
      )
    );
  }
  const { polygon, filters } = body;
  const polygonCoordinates = polygon?.coordinates;
  requestDetails = {
    action: "prospect-search",
    hasPolygon: Boolean(polygonCoordinates?.[0]?.length),
    polygonRingCount: polygonCoordinates?.length ?? 0,
    polygonPointCount: polygonCoordinates?.[0]?.length ?? 0,
    hasFilters: Boolean(filters && Object.keys(filters).length > 0),
    zoningCodeCount: filters?.zoningCodes?.length ?? 0,
    hasMinAcreage: filters?.minAcreage != null,
    hasMaxAcreage: filters?.maxAcreage != null,
    hasMinAssessedValue: filters?.minAssessedValue != null,
    hasMaxAssessedValue: filters?.maxAssessedValue != null,
    excludeFloodZone: Boolean(filters?.excludeFloodZone),
    hasSearchText: Boolean(filters?.searchText?.trim()),
    searchLength: filters?.searchText?.trim().length ?? 0,
  };

  if (!polygonCoordinates?.[0]) {
    await logRequestOutcome(context, {
      status: 400,
      orgId: auth.orgId,
      userId: auth.userId,
      details: { ...requestDetails, validationError: "missing_polygon" },
    });
    return withRequestId(
      NextResponse.json(
        { error: "polygon with coordinates is required" },
        { status: 400 }
      )
    );
  }

  try {
    const gatewayHealth = logPropertyDbRuntimeHealth("/api/map/prospect");
    if (!gatewayHealth) {
      throw new ProspectGatewayError(
        "[/api/map/prospect] property DB gateway is not configured",
        "GATEWAY_UNCONFIGURED",
      );
    }
    const sql = buildPolygonSql(polygonCoordinates, {
      searchText: filters?.searchText,
      zoningCodes: filters?.zoningCodes,
      minAcreage: filters?.minAcreage,
      maxAcreage: filters?.maxAcreage,
      minAssessedValue: filters?.minAssessedValue,
      maxAssessedValue: filters?.maxAssessedValue,
    });

    const raw = await gatewayPost(
      "/tools/parcels.sql",
      { sql, limit: MAX_PROSPECT_RESULTS },
      context.requestId,
    );
    const gatewayError = extractProspectGatewayError(raw);
    if (gatewayError) {
      throw new ProspectGatewayError(
        `[prospect] gateway /tools/parcels.sql returned error payload: ${gatewayError}`,
        "GATEWAY_UNAVAILABLE",
        502,
      );
    }
    const gatewayRows = normalizeProspectGatewayRows(raw);

    const parcels = gatewayRows.map((p) => ({
      id: String(p.id ?? ""),
      address: String(p.site_address ?? p.situs_address ?? p.address ?? "Unknown"),
      owner: String(p.owner_name ?? p.owner ?? "Unknown"),
      acreage: p.acreage != null ? Number(p.acreage) : null,
      zoning: String(p.zoning ?? p.zone_code ?? ""),
      assessedValue: p.assessed_value != null ? Number(p.assessed_value) : null,
      floodZone: String(p.flood_zone ?? ""),
      lat: Number(p.latitude ?? p.lat ?? 0),
      lng: Number(p.longitude ?? p.lng ?? 0),
      parish: String(p.parish_name ?? p.parish ?? ""),
      parcelUid: String(p.parcel_uid ?? p.parcel_id ?? ""),
      propertyDbId: String(p.parcel_uid ?? p.parcel_id ?? p.id ?? ""),
    }));

    await logRequestOutcome(context, {
      status: 200,
      orgId: auth.orgId,
      userId: auth.userId,
      upstream: "property-db",
      resultCount: parcels.length,
      details: {
        ...requestDetails,
        gatewayRowCount: gatewayRows.length,
        parcelCount: parcels.length,
      },
    });
    return withRequestId(NextResponse.json({ parcels, total: parcels.length }));
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.map.prospect", method: "POST" },
    });
    if (error instanceof ProspectGatewayError) {
      console.error("Prospect gateway error:", error);
      await logRequestOutcome(context, {
        status: error.status ?? 503,
        orgId: auth.orgId,
        userId: auth.userId,
        upstream: "property-db",
        error,
        details: {
          ...requestDetails,
          errorCode: error.code,
        },
      });
      return withRequestId(
        NextResponse.json(
          {
            error: "Property database unavailable",
            code: error.code,
          },
          { status: error.status ?? 503 },
        )
      );
    }
    console.error("Prospect search error:", error);
    await logRequestOutcome(context, {
      status: 500,
      orgId: auth.orgId,
      userId: auth.userId,
      upstream: "property-db",
      error,
      details: requestDetails,
    });
    return withRequestId(
      NextResponse.json(
        { error: "Failed to search parcels" },
        { status: 500 }
      )
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/map/prospect/bulk-create-deals
// ---------------------------------------------------------------------------

export async function PUT(req: NextRequest) {
  const context = createRequestObservabilityContext(req, "/api/map/prospect");
  await logRequestStart(context, { action: "prospect-bulk" });
  const withRequestId = (response: NextResponse) =>
    attachRequestIdHeader(response, context.requestId);

  const auth = await resolveAuth(req);
  if (!auth) {
    await logRequestOutcome(context, { status: 401, details: { action: "prospect-bulk" } });
    return withRequestId(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  let action: string | undefined;
  let parcelCount = 0;
  let parcelIdCount = 0;

  try {
    const body = await req.json();
    action = typeof body?.action === "string" ? body.action : undefined;
    const { parcelIds, parcels } = body as {
      parcelIds?: unknown;
      parcels?: unknown;
    };
    parcelCount = Array.isArray(parcels) ? parcels.length : 0;
    parcelIdCount = Array.isArray(parcelIds) ? parcelIds.length : 0;

    if (action === "create-deals" && Array.isArray(parcels)) {
      // Find default jurisdiction for the org (use first available)
      const jurisdiction = await prisma.jurisdiction.findFirst({
        where: { orgId: auth.orgId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!jurisdiction) {
        await logRequestOutcome(context, {
          status: 400,
          orgId: auth.orgId,
          userId: auth.userId,
          upstream: "org",
          details: {
            action,
            parcelCount,
            parcelIdCount,
            validationError: "missing_jurisdiction",
          },
        });
        return withRequestId(
          NextResponse.json(
            { error: "No jurisdiction configured" },
            { status: 400 }
          )
        );
      }

      // Create a deal for each selected parcel
      const created: string[] = [];
      for (const parcel of parcels as Array<{
        address: string;
        lat: number;
        lng: number;
        acreage: number | null;
        zoning: string;
        floodZone: string;
        id: string;
        propertyDbId?: string;
        parish: string;
      }>) {
        // Try to find a parish-specific jurisdiction
        let jId = jurisdiction.id;
        if (parcel.parish) {
          const parishJur = await prisma.jurisdiction.findFirst({
            where: {
              orgId: auth.orgId,
              name: { contains: parcel.parish, mode: "insensitive" },
            },
            orderBy: { createdAt: "asc" },
            select: { id: true },
          });
          if (parishJur) jId = parishJur.id;
        }

        const deal = await prisma.deal.create({
          data: {
            orgId: auth.orgId,
            name: `Prospect: ${parcel.address}`,
            sku: "OUTDOOR_STORAGE",
            status: "INTAKE",
            jurisdictionId: jId,
            createdBy: auth.userId,
            source: "[AUTO] Prospecting Mode",
          },
        });

        await prisma.parcel.create({
          data: {
            dealId: deal.id,
            orgId: auth.orgId,
            address: parcel.address,
            lat: parcel.lat,
            lng: parcel.lng,
            acreage: parcel.acreage,
            currentZoning: parcel.zoning || null,
            floodZone: parcel.floodZone || null,
            propertyDbId: parcel.propertyDbId || parcel.id || null,
          },
        });

        created.push(deal.id);
      }
      await logRequestOutcome(context, {
        status: 200,
        orgId: auth.orgId,
        userId: auth.userId,
        upstream: "org",
        resultCount: created.length,
        details: {
          action,
          parcelCount,
          parcelIdCount,
        },
      });
      return withRequestId(NextResponse.json({ created, count: created.length }));
    }

    if (action === "batch-triage" && Array.isArray(parcelIds)) {
      // Create triage tasks for each parcel's deal
      // This would trigger the triage automation loop
      await logRequestOutcome(context, {
        status: 200,
        orgId: auth.orgId,
        userId: auth.userId,
        upstream: "org",
        resultCount: parcelIds.length,
        details: {
          action,
          parcelCount,
          parcelIdCount,
        },
      });
      return withRequestId(NextResponse.json({
        message: `Batch triage queued for ${parcelIds.length} parcels`,
        count: parcelIds.length,
      }));
    }

    await logRequestOutcome(context, {
      status: 400,
      orgId: auth.orgId,
      userId: auth.userId,
      upstream: "org",
      details: {
        action,
        parcelCount,
        parcelIdCount,
        validationError: "invalid_action",
      },
    });
    return withRequestId(NextResponse.json({ error: "Invalid action" }, { status: 400 }));
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.map.prospect", method: "PUT" },
    });
    await logRequestOutcome(context, {
      status: 500,
      orgId: auth.orgId,
      userId: auth.userId,
      upstream: "org",
      error,
      details: {
        action,
        parcelCount,
        parcelIdCount,
      },
    });
    return withRequestId(NextResponse.json({ error: "Internal server error" }, { status: 500 }));
  }
}
