import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const PROPERTY_DB_URL =
  process.env.LA_PROPERTY_DB_URL ?? "https://jueyosscalcljgdorrpy.supabase.co";
const PROPERTY_DB_KEY = process.env.LA_PROPERTY_DB_KEY ?? "";
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

async function propertyRpc(
  fnName: string,
  body: Record<string, unknown>,
): Promise<unknown[]> {
  if (!PROPERTY_DB_URL || !PROPERTY_DB_KEY) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${PROPERTY_DB_URL}/rest/v1/rpc/${fnName}`, {
      method: "POST",
      headers: {
        apikey: PROPERTY_DB_KEY,
        Authorization: `Bearer ${PROPERTY_DB_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function mapExternalParcelToApiShape(
  row: Record<string, unknown>,
): Record<string, unknown> | null {
  const lat = Number(row.latitude ?? row.lat ?? 0);
  const lng = Number(row.longitude ?? row.lng ?? 0);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
    return null;
  }

  const propertyDbId = String(
    row.id ?? row.parcel_uid ?? row.parcel_id ?? row.apn ?? "",
  );

  return {
    id: `ext-${propertyDbId || `${lat}-${lng}`}`,
    address: String(row.site_address ?? row.situs_address ?? row.address ?? "Unknown"),
    lat,
    lng,
    acreage:
      row.acreage != null && Number.isFinite(Number(row.acreage))
        ? Number(row.acreage)
        : null,
    floodZone: row.flood_zone ? String(row.flood_zone) : null,
    currentZoning: row.zoning ? String(row.zoning) : row.zone_code ? String(row.zone_code) : null,
    propertyDbId,
    deal: null,
  };
}

async function searchPropertyDbParcels(
  searchText: string,
  parish?: string,
  limitRows: number = 120,
): Promise<unknown[]> {
  const normalizedSearch = searchText.trim().length > 0 ? searchText : "*";
  const primaryResult = await propertyRpc("api_search_parcels", {
    search_text: normalizedSearch,
    parish,
    limit_rows: limitRows,
  });
  if (primaryResult.length > 0) return primaryResult;

  return propertyRpc("api_search_parcels", {
    p_search_text: normalizedSearch,
    p_parish: parish,
    p_limit: limitRows,
  });
}

// GET /api/parcels - list parcels across all deals
export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hasCoords = request.nextUrl.searchParams.get("hasCoords") === "true";

    const where: Record<string, unknown> = { orgId: auth.orgId };
    if (hasCoords) {
      where.lat = { not: null };
      where.lng = { not: null };
    }

    const parcels = await prisma.parcel.findMany({
      where,
      include: {
        deal: {
          select: { id: true, name: true, sku: true, status: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    if (parcels.length > 0 || !hasCoords) {
      return NextResponse.json({ parcels, source: "org" });
    }

    const fallbackQueries: Array<Promise<unknown[]>> = [
      ...PROPERTY_DB_PARISHES.map((parish) =>
        searchPropertyDbParcels("*", parish, 150),
      ),
      ...PROPERTY_DB_SEARCH_TERMS.map((term) =>
        searchPropertyDbParcels(term, undefined, 200),
      ),
      searchPropertyDbParcels("*", undefined, 200),
    ];

    const parishResults = await Promise.all(
      fallbackQueries,
    );

    const externalRows = parishResults.flat();
    const mappedExternal = externalRows
      .map((row) =>
        typeof row === "object" && row !== null
          ? mapExternalParcelToApiShape(row as Record<string, unknown>)
          : null,
      )
      .filter((row): row is Record<string, unknown> => row !== null);

    const deduped = Array.from(
      new Map(mappedExternal.map((item) => [String(item.id), item])).values(),
    ).slice(0, 500);

    return NextResponse.json({ parcels: deduped, source: "property-db-fallback" });
  } catch (error) {
    console.error("Error fetching parcels:", error);
    return NextResponse.json(
      { error: "Failed to fetch parcels" },
      { status: 500 }
    );
  }
}
