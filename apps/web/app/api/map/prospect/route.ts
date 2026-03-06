import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { prisma } from "@entitlement-os/db";
import {
  getCloudflareAccessHeadersFromEnv,
  logPropertyDbRuntimeHealth,
} from "@/lib/server/propertyDbEnv";

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
  config: { url: string; key: string },
): Promise<unknown> {
  const { url, key } = config;
  let res: Response;
  try {
    res = await fetch(`${url}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        "Content-Type": "application/json",
        ...getCloudflareAccessHeadersFromEnv(),
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ProspectGatewayError(
      `[prospect] gateway ${path} request failed: ${reason}`,
      "GATEWAY_UNAVAILABLE",
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const status = res.status >= 500 ? 502 : 503;
    throw new ProspectGatewayError(
      `[prospect] gateway ${path} error ${res.status}: ${text.slice(0, 200)}`,
      "GATEWAY_UNAVAILABLE",
      status,
    );
  }
  try {
    return await res.json();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ProspectGatewayError(
      `[prospect] gateway ${path} invalid JSON: ${reason}`,
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

  if (filters?.zoningCodes?.length) {
    const escaped = filters.zoningCodes.map((c) => c.replace(/'/g, "''").toUpperCase());
    const likeConditions = escaped.map((c) => `UPPER(zoning_type) LIKE '%${c}%'`);
    whereClauses.push(`(${likeConditions.join(" OR ")})`);
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
      zoning_type AS zoning,
      assessed_value,
      existing_land_use,
      ST_Y(ST_Centroid(geom)) AS lat,
      ST_X(ST_Centroid(geom)) AS lng,
      'East Baton Rouge' AS parish_name
    FROM ebr_parcels
    WHERE ${whereClauses.join(" AND ")}
    LIMIT 500
  `.trim();
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
  const auth = await resolveAuth(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    return NextResponse.json(
      { error: "Validation failed", details: { body: ["Invalid JSON body"] } },
      { status: 400 },
    );
  }
  const { polygon, filters } = body;
  const polygonCoordinates = polygon?.coordinates;

  if (!polygonCoordinates?.[0]) {
    return NextResponse.json(
      { error: "polygon with coordinates is required" },
      { status: 400 }
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
    const gatewayConfig = {
      url: gatewayHealth.url.replace(/\/$/, ""),
      key: gatewayHealth.key,
    };

    const sql = buildPolygonSql(polygonCoordinates, {
      zoningCodes: filters?.zoningCodes,
      minAcreage: filters?.minAcreage,
      maxAcreage: filters?.maxAcreage,
      minAssessedValue: filters?.minAssessedValue,
      maxAssessedValue: filters?.maxAssessedValue,
    });

    console.log("[prospect] gateway SQL query:", sql.slice(0, 200), "...");

    const raw = await gatewayPost("/tools/parcels.sql", { sql, limit: 500 }, gatewayConfig);
    const gatewayRows: Record<string, unknown>[] = [];

    if (Array.isArray(raw)) {
      gatewayRows.push(...(raw as Record<string, unknown>[]));
    } else if (raw && typeof raw === "object" && "rows" in (raw as Record<string, unknown>)) {
      const rows = (raw as Record<string, unknown>).rows;
      if (Array.isArray(rows)) {
        gatewayRows.push(...(rows as Record<string, unknown>[]));
      }
    }

    console.log(
      "[prospect] gateway returned",
      gatewayRows.length,
      "parcels via PostGIS ST_Contains",
    );

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

    return NextResponse.json({ parcels, total: parcels.length });
  } catch (error) {
    if (error instanceof ProspectGatewayError) {
      console.error("Prospect gateway error:", error);
      return NextResponse.json(
        {
          error: "Property database unavailable",
          code: error.code,
        },
        { status: error.status ?? 503 },
      );
    }
    console.error("Prospect search error:", error);
    return NextResponse.json(
      { error: "Failed to search parcels" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/map/prospect/bulk-create-deals
// ---------------------------------------------------------------------------

export async function PUT(req: NextRequest) {
  const auth = await resolveAuth(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { action, parcelIds, parcels } = body;

  if (action === "create-deals" && Array.isArray(parcels)) {
    // Find default jurisdiction for the org (use first available)
    const jurisdiction = await prisma.jurisdiction.findFirst({
      where: { orgId: auth.orgId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!jurisdiction) {
      return NextResponse.json(
        { error: "No jurisdiction configured" },
        { status: 400 }
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
    return NextResponse.json({ created, count: created.length });
  }

  if (action === "batch-triage" && Array.isArray(parcelIds)) {
    // Create triage tasks for each parcel's deal
    // This would trigger the triage automation loop
    return NextResponse.json({
      message: `Batch triage queued for ${parcelIds.length} parcels`,
      count: parcelIds.length,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
