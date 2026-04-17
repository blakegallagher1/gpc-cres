import { requestPropertyDbGateway } from "../search/property-db-rpc.service";
import { PropertyDbGatewayError } from "../search/property-db-gateway.service";
import { logger } from "../logger";

/**
 * Owner-entity clustering. The property DB `ebr_parcels.owner` column is a
 * free-text string with heavy formatting drift (trailing LLC/Inc, punctuation,
 * mailing address noise). We normalize aggressively, group by the normalized
 * key, and return cluster stats so a CRE operator can see "this LLC owns 8
 * adjacent parcels totaling 40 acres" at a glance.
 */

export interface OwnerPortfolioParcel {
  parcelId: string;
  address: string | null;
  acreage: number | null;
  lat: number | null;
  lng: number | null;
  assessedValue: number | null;
}

export interface OwnerPortfolio {
  normalizedOwner: string;
  canonicalOwner: string;
  variantCount: number;
  parcelCount: number;
  totalAcreage: number;
  totalAssessedValue: number;
  centroid: { lat: number; lng: number } | null;
  parcels: OwnerPortfolioParcel[];
}

export interface ListOwnerPortfoliosOptions {
  minParcelCount?: number;
  limit?: number;
  requestId?: string;
}

const COMPANY_SUFFIXES = [
  "LLC",
  "L.L.C.",
  "L L C",
  "INC",
  "INCORPORATED",
  "CORP",
  "CORPORATION",
  "CO",
  "COMPANY",
  "LP",
  "L.P.",
  "LLP",
  "PC",
  "TRUST",
  "TR",
  "ESTATE",
  "FAMILY",
  "LTD",
  "LIMITED",
  "PARTNERSHIP",
  "HOLDINGS",
  "HOLDING",
  "GROUP",
  "ASSOCIATES",
  "PROPERTIES",
  "PROPERTY",
  "INVESTMENTS",
  "ENTERPRISES",
];

const STOPWORD_SUFFIX_RX = new RegExp(`\\b(${COMPANY_SUFFIXES.join("|")})\\b\\.?`, "gi");

/**
 * Aggressive owner-name normalization. Preserves order but strips legal-entity
 * suffixes, punctuation, mailing-address noise, and extra whitespace so
 * "Acme Holdings LLC" / "ACME HOLDINGS, L.L.C." / "Acme Holdings Inc." all
 * collapse to the same key `acme holdings`.
 */
export function normalizeOwnerName(raw: string | null | undefined): string {
  if (!raw) return "";
  let value = raw.trim();
  if (!value) return "";
  // strip trailing mailing address / attention lines
  value = value.split(/\n|;|\s{2,}/)[0] ?? value;
  value = value.toLowerCase();
  value = value.replace(/[,.#&]+/g, " ");
  value = value.replace(/\b(c\/o|attn|attention|p ?o box|po box)\b.*$/i, "");
  value = value.replace(STOPWORD_SUFFIX_RX, " ");
  value = value.replace(/\s+/g, " ").trim();
  return value;
}

/**
 * Quick heuristic — distinguishes likely business entities from individuals.
 * An entity cluster is high signal for CRE (adjacent holdings); an individual
 * cluster is noise. Used by the UI to filter by entity type.
 */
export function classifyOwner(raw: string | null | undefined): "entity" | "individual" | "unknown" {
  if (!raw) return "unknown";
  const upper = raw.toUpperCase();
  for (const suffix of COMPANY_SUFFIXES) {
    const rx = new RegExp(`\\b${suffix.replace(/\./g, "\\.")}\\b`, "i");
    if (rx.test(upper)) return "entity";
  }
  if (/,/.test(raw) && /^[A-Z][A-Z]+,\s*[A-Z]/.test(upper)) return "individual";
  return "unknown";
}

interface ParcelRow {
  parcel_id: string | null;
  owner: string | null;
  address: string | null;
  acreage: number | null;
  assessed_value: number | null;
  lat: number | null;
  lng: number | null;
}

function sanitizeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function buildOwnerSearchSql(normalizedKey: string, limit: number): string {
  const safe = sanitizeSql(normalizedKey);
  return `
    SELECT
      parcel_id,
      owner,
      address,
      (area_sqft / 43560.0) AS acreage,
      assessed_value,
      ST_Y(ST_Centroid(geom)) AS lat,
      ST_X(ST_Centroid(geom)) AS lng
    FROM ebr_parcels
    WHERE
      regexp_replace(
        regexp_replace(lower(coalesce(owner, '')), '\\s+(llc|l\\.l\\.c\\.|inc|corp|corporation|co|lp|trust|tr|estate|holdings|properties|group|llp|ltd|partnership|ent enterprises)\\.?\\s*$', '', 'g'),
        '[,\\.]+', ' ', 'g'
      ) ILIKE '%${safe}%'
      AND owner IS NOT NULL
      AND owner <> ''
      AND geom IS NOT NULL
    ORDER BY assessed_value DESC NULLS LAST
    LIMIT ${Math.max(1, Math.min(limit, 500))}
  `.trim();
}

function buildBboxOwnerSql(
  bounds: { west: number; south: number; east: number; north: number },
  minParcelCount: number,
  limit: number,
): string {
  const { west, south, east, north } = bounds;
  return `
    WITH bbox_parcels AS (
      SELECT
        parcel_id,
        owner,
        address,
        (area_sqft / 43560.0) AS acreage,
        assessed_value,
        ST_Y(ST_Centroid(geom)) AS lat,
        ST_X(ST_Centroid(geom)) AS lng
      FROM ebr_parcels
      WHERE geom && ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326)
        AND owner IS NOT NULL
        AND owner <> ''
    )
    SELECT * FROM bbox_parcels
    WHERE owner IN (
      SELECT owner
      FROM bbox_parcels
      GROUP BY owner
      HAVING COUNT(*) >= ${Math.max(1, minParcelCount)}
    )
    LIMIT ${Math.max(1, Math.min(limit, 5000))}
  `.trim();
}

async function runParcelsSql(sql: string, requestId?: string): Promise<ParcelRow[]> {
  const response = await requestPropertyDbGateway({
    routeTag: "/api/map/ownership-clusters",
    path: "/tools/parcels.sql",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql }),
    requestId,
    includeApiKey: true,
    internalScope: "map.read",
    maxRetries: 1,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new PropertyDbGatewayError(
      `ownership-clusters gateway ${response.status}: ${body.slice(0, 200)}`,
      "GATEWAY_UNAVAILABLE",
      503,
    );
  }
  const raw = (await response.json().catch(() => null)) as { rows?: ParcelRow[] } | ParcelRow[] | null;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return Array.isArray(raw.rows) ? raw.rows : [];
}

function toPortfolio(rows: ParcelRow[]): OwnerPortfolio[] {
  const grouped = new Map<string, ParcelRow[]>();
  for (const row of rows) {
    const key = normalizeOwnerName(row.owner);
    if (!key) continue;
    const arr = grouped.get(key) ?? [];
    arr.push(row);
    grouped.set(key, arr);
  }

  const portfolios: OwnerPortfolio[] = [];
  for (const [normalizedOwner, parcels] of grouped) {
    const variants = new Set(parcels.map((p) => (p.owner ?? "").trim()).filter(Boolean));
    const totalAcreage = parcels.reduce(
      (sum, p) => sum + (typeof p.acreage === "number" ? p.acreage : 0),
      0,
    );
    const totalAssessedValue = parcels.reduce(
      (sum, p) => sum + (typeof p.assessed_value === "number" ? p.assessed_value : 0),
      0,
    );
    const withGeo = parcels.filter(
      (p) => typeof p.lat === "number" && typeof p.lng === "number",
    );
    const centroid =
      withGeo.length > 0
        ? {
            lat: withGeo.reduce((s, p) => s + (p.lat ?? 0), 0) / withGeo.length,
            lng: withGeo.reduce((s, p) => s + (p.lng ?? 0), 0) / withGeo.length,
          }
        : null;
    const canonical =
      [...variants].sort((a, b) => b.length - a.length)[0] ?? normalizedOwner;

    portfolios.push({
      normalizedOwner,
      canonicalOwner: canonical,
      variantCount: variants.size,
      parcelCount: parcels.length,
      totalAcreage,
      totalAssessedValue,
      centroid,
      parcels: parcels.map((p) => ({
        parcelId: p.parcel_id ?? "",
        address: p.address ?? null,
        acreage: typeof p.acreage === "number" ? p.acreage : null,
        lat: typeof p.lat === "number" ? p.lat : null,
        lng: typeof p.lng === "number" ? p.lng : null,
        assessedValue: typeof p.assessed_value === "number" ? p.assessed_value : null,
      })),
    });
  }

  portfolios.sort((a, b) => b.parcelCount - a.parcelCount || b.totalAcreage - a.totalAcreage);
  return portfolios;
}

/**
 * Lookup portfolio for a single owner (typically: click on a parcel,
 * see "this owner also owns N other parcels").
 */
export async function lookupOwnerPortfolio(input: {
  ownerName: string;
  limit?: number;
  requestId?: string;
}): Promise<OwnerPortfolio | null> {
  const normalized = normalizeOwnerName(input.ownerName);
  if (!normalized) return null;
  try {
    const sql = buildOwnerSearchSql(normalized, input.limit ?? 200);
    const rows = await runParcelsSql(sql, input.requestId);
    const portfolios = toPortfolio(rows);
    return portfolios.find((p) => p.normalizedOwner === normalized) ?? portfolios[0] ?? null;
  } catch (error) {
    logger.warn("Owner portfolio lookup failed", {
      ownerName: input.ownerName,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * List owner clusters within a bounding box — used for the "top LLCs in this
 * view" map-side ranking panel. Returns only clusters with ≥ minParcelCount.
 */
export async function listOwnerClustersInBbox(input: {
  bounds: { west: number; south: number; east: number; north: number };
  minParcelCount?: number;
  limit?: number;
  requestId?: string;
}): Promise<OwnerPortfolio[]> {
  const minParcelCount = input.minParcelCount ?? 3;
  const limit = input.limit ?? 2000;
  const sql = buildBboxOwnerSql(input.bounds, minParcelCount, limit);
  const rows = await runParcelsSql(sql, input.requestId);
  const portfolios = toPortfolio(rows).filter(
    (p) => p.parcelCount >= minParcelCount,
  );
  return portfolios;
}
