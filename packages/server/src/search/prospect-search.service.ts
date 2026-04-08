import { prisma } from "@entitlement-os/db";
import {
  PropertyDbGatewayError,
  requestPropertyDbGateway,
} from "./property-db-gateway.service";
import {
  STREET_SUFFIX_ABBREVIATED,
  STREET_SUFFIX_CANONICAL,
} from "./spatial-search.shared";

const MAX_PROSPECT_RESULTS = 100;
const PROSPECT_SEARCH_FIELDS = [
  "regexp_replace(LOWER(COALESCE(address, '')), '[^a-z0-9]+', ' ', 'g')",
  "regexp_replace(LOWER(COALESCE(owner, '')), '[^a-z0-9]+', ' ', 'g')",
  "regexp_replace(LOWER(COALESCE(parcel_id, '')), '[^a-z0-9]+', ' ', 'g')",
] as const;

export type ProspectRouteServiceResult = {
  status: number;
  body: Record<string, unknown>;
  upstream: string;
  resultCount: number;
  details: Record<string, unknown>;
};

type ProspectParcelInput = {
  address: string;
  lat: number;
  lng: number;
  acreage: number | null;
  zoning: string;
  floodZone: string;
  id: string;
  propertyDbId?: string;
  parish: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every((item) => isRecord(item));
}

function mapColumnarRows(columnNames: string[], rows: unknown[]): Record<string, unknown>[] {
  return rows.flatMap((row) => {
    if (!Array.isArray(row)) return [];
    return [Object.fromEntries(columnNames.map((columnName, index) => [columnName, row[index] ?? null]))];
  });
}

function normalizeProspectGatewayRows(value: unknown): Record<string, unknown>[] {
  if (!value) return [];
  if (isRecordArray(value)) return value;
  if (!isRecord(value)) return [];

  const rawColumnNames = Array.isArray(value.columnNames) ? value.columnNames : value.columns;
  const columnNames = Array.isArray(rawColumnNames)
    ? rawColumnNames.filter((item): item is string => typeof item === "string")
    : null;
  if (columnNames?.length && Array.isArray(value.rows)) {
    return mapColumnarRows(columnNames, value.rows);
  }

  for (const candidate of [value.data, value.rows, value.result, value.items, value.parcels]) {
    if (candidate !== undefined) return normalizeProspectGatewayRows(candidate);
  }

  if (value.id != null || value.site_address != null || value.situs_address != null || value.address != null) {
    return [value];
  }

  return [];
}

function extractProspectGatewayError(value: unknown): string | null {
  if (!isRecord(value)) return null;
  if (value.ok === false && typeof value.error === "string" && value.error.trim().length > 0) {
    return value.error.trim();
  }
  for (const candidate of [value.data, value.result]) {
    if (candidate === undefined) continue;
    const nestedError = extractProspectGatewayError(candidate);
    if (nestedError) return nestedError;
  }
  return null;
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
  if (!normalized || normalized === "*") return [];
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
  if (patterns.length === 0) return null;
  const comparisons = patterns.flatMap((pattern) =>
    PROSPECT_SEARCH_FIELDS.map((field) => `${field} LIKE '${pattern}' ESCAPE '\\'`),
  );
  return `(${comparisons.join(" OR ")})`;
}

function buildPolygonSql(
  polygonCoordinates: number[][][],
  filters?: {
    searchText?: string;
    minAcreage?: number;
    maxAcreage?: number;
    minAssessedValue?: number;
    maxAssessedValue?: number;
  },
): string {
  const geojson = JSON.stringify({ type: "Polygon", coordinates: polygonCoordinates });
  const whereClauses: string[] = [
    `ST_Contains(ST_SetSRID(ST_GeomFromGeoJSON('${geojson.replace(/'/g, "''")}'), 4326), geom)`,
  ];
  const searchClause = buildProspectSearchClause(filters?.searchText);
  if (searchClause) whereClauses.push(searchClause);
  if (filters?.minAcreage != null) whereClauses.push(`(area_sqft / 43560.0) >= ${Number(filters.minAcreage)}`);
  if (filters?.maxAcreage != null) whereClauses.push(`(area_sqft / 43560.0) <= ${Number(filters.maxAcreage)}`);
  if (filters?.minAssessedValue != null) whereClauses.push(`assessed_value >= ${Number(filters.minAssessedValue)}`);
  if (filters?.maxAssessedValue != null) whereClauses.push(`assessed_value <= ${Number(filters.maxAssessedValue)}`);
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

export async function searchProspectsForRoute(input: {
  polygonCoordinates?: number[][][];
  filters?: {
    searchText?: string;
    minAcreage?: number;
    maxAcreage?: number;
    zoningCodes?: string[];
    excludeFloodZone?: boolean;
    minAssessedValue?: number;
    maxAssessedValue?: number;
  };
  requestId: string;
}): Promise<ProspectRouteServiceResult> {
  if (!input.polygonCoordinates?.[0]) {
    return {
      status: 400,
      body: { error: "polygon with coordinates is required" },
      upstream: "property-db",
      resultCount: 0,
      details: { validationError: "missing_polygon" },
    };
  }

  try {
    const sql = buildPolygonSql(input.polygonCoordinates, {
      searchText: input.filters?.searchText,
      minAcreage: input.filters?.minAcreage,
      maxAcreage: input.filters?.maxAcreage,
      minAssessedValue: input.filters?.minAssessedValue,
      maxAssessedValue: input.filters?.maxAssessedValue,
    });
    const raw = await requestPropertyDbGateway({
      routeTag: "/api/map/prospect",
      path: "/tools/parcels.sql",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql, limit: MAX_PROSPECT_RESULTS }),
      requestId: input.requestId,
      includeApiKey: true,
      internalScope: "map.read",
      maxRetries: 1,
    }).then((response) => response.json());

    const gatewayError = extractProspectGatewayError(raw);
    if (gatewayError) {
      throw new PropertyDbGatewayError(
        `[prospect] gateway /tools/parcels.sql returned error payload: ${gatewayError}`,
        "GATEWAY_UNAVAILABLE",
        502,
      );
    }

    const gatewayRows = normalizeProspectGatewayRows(raw);
    const parcels = gatewayRows.map((parcel) => ({
      id: String(parcel.id ?? ""),
      address: String(parcel.site_address ?? parcel.situs_address ?? parcel.address ?? "Unknown"),
      owner: String(parcel.owner_name ?? parcel.owner ?? "Unknown"),
      acreage: parcel.acreage != null ? Number(parcel.acreage) : null,
      zoning: String(parcel.zoning ?? parcel.zone_code ?? ""),
      assessedValue: parcel.assessed_value != null ? Number(parcel.assessed_value) : null,
      floodZone: String(parcel.flood_zone ?? ""),
      lat: Number(parcel.latitude ?? parcel.lat ?? 0),
      lng: Number(parcel.longitude ?? parcel.lng ?? 0),
      parish: String(parcel.parish_name ?? parcel.parish ?? ""),
      parcelUid: String(parcel.parcel_uid ?? parcel.parcel_id ?? ""),
      propertyDbId: String(parcel.parcel_uid ?? parcel.parcel_id ?? parcel.id ?? ""),
    }));

    return {
      status: 200,
      body: { parcels, total: parcels.length },
      upstream: "property-db",
      resultCount: parcels.length,
      details: { gatewayRowCount: gatewayRows.length, parcelCount: parcels.length },
    };
  } catch (error) {
    if (error instanceof PropertyDbGatewayError) {
      return {
        status: error.status ?? 503,
        body: {
          error: "Property database unavailable",
          code: error.code,
        },
        upstream: "property-db",
        resultCount: 0,
        details: { errorCode: error.code },
      };
    }
    return {
      status: 500,
      body: { error: "Failed to search parcels" },
      upstream: "property-db",
      resultCount: 0,
      details: {},
    };
  }
}

export async function updateProspectsForRoute(input: {
  orgId: string;
  userId: string;
  action?: string;
  parcelIds?: unknown;
  parcels?: unknown;
}): Promise<ProspectRouteServiceResult> {
  const parcelCount = Array.isArray(input.parcels) ? input.parcels.length : 0;
  const parcelIdCount = Array.isArray(input.parcelIds) ? input.parcelIds.length : 0;

  if (input.action === "create-deals" && Array.isArray(input.parcels)) {
    const jurisdiction = await prisma.jurisdiction.findFirst({
      where: { orgId: input.orgId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!jurisdiction) {
      return {
        status: 400,
        body: { error: "No jurisdiction configured" },
        upstream: "org",
        resultCount: 0,
        details: {
          action: input.action,
          parcelCount,
          parcelIdCount,
          validationError: "missing_jurisdiction",
        },
      };
    }

    const created: string[] = [];
    for (const parcel of input.parcels as ProspectParcelInput[]) {
      let jurisdictionId = jurisdiction.id;
      if (parcel.parish) {
        const parishJurisdiction = await prisma.jurisdiction.findFirst({
          where: {
            orgId: input.orgId,
            name: { contains: parcel.parish, mode: "insensitive" },
          },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
        if (parishJurisdiction) jurisdictionId = parishJurisdiction.id;
      }

      const deal = await prisma.deal.create({
        data: {
          orgId: input.orgId,
          name: `Prospect: ${parcel.address}`,
          sku: "OUTDOOR_STORAGE",
          status: "INTAKE",
          jurisdictionId,
          createdBy: input.userId,
          source: "[AUTO] Prospecting Mode",
        },
      });

      await prisma.parcel.create({
        data: {
          dealId: deal.id,
          orgId: input.orgId,
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

    return {
      status: 200,
      body: { created, count: created.length },
      upstream: "org",
      resultCount: created.length,
      details: { action: input.action, parcelCount, parcelIdCount },
    };
  }

  if (input.action === "batch-triage" && Array.isArray(input.parcelIds)) {
    return {
      status: 200,
      body: {
        message: `Batch triage queued for ${input.parcelIds.length} parcels`,
        count: input.parcelIds.length,
      },
      upstream: "org",
      resultCount: input.parcelIds.length,
      details: { action: input.action, parcelCount, parcelIdCount },
    };
  }

  return {
    status: 400,
    body: { error: "Invalid action" },
    upstream: "org",
    resultCount: 0,
    details: {
      action: input.action,
      parcelCount,
      parcelIdCount,
      validationError: "invalid_action",
    },
  };
}
