/**
 * Parcel Field Catalog — Canonical field names, database columns, types, and alias resolution
 *
 * Maps user-friendly field names (canonical) to database column metadata and aliases.
 * Supports alias resolution from snake_case, camelCase, and raw DB column names.
 */

export type FieldType = "string" | "number" | "boolean";

export interface FieldMetadata {
  dbColumn: string;
  type: FieldType;
  aliases: string[];
}

/**
 * ParcelFieldCatalog maps canonical field names to database metadata
 * Canonical names follow camelCase convention (e.g., parcelId, assessedValue)
 */
export const ParcelFieldCatalog: Record<string, FieldMetadata> = {
  parcelId: {
    dbColumn: "p_parcel_id",
    type: "string",
    aliases: ["parcel_id", "id"],
  },
  address: {
    dbColumn: "site_addr",
    type: "string",
    aliases: ["site_addr", "siteAddr"],
  },
  owner: {
    dbColumn: "owner_name",
    type: "string",
    aliases: ["owner_name", "ownerName"],
  },
  acres: {
    dbColumn: "area_acres",
    type: "number",
    aliases: ["area_acres", "areaAcres"],
  },
  zoningType: {
    dbColumn: "zoning_type",
    type: "string",
    aliases: ["zoning_type", "zoning"],
  },
  parish: {
    dbColumn: "parish",
    type: "string",
    aliases: [],
  },
  assessedValue: {
    dbColumn: "assessed_value",
    type: "number",
    aliases: ["assessed_value", "assessedValue"],
  },
  latitude: {
    dbColumn: "centroid_lat",
    type: "number",
    aliases: ["centroid_lat", "lat"],
  },
  longitude: {
    dbColumn: "centroid_lng",
    type: "number",
    aliases: ["centroid_lng", "lng"],
  },
};

/**
 * Build a reverse lookup map: any input (alias, snake_case, camelCase, canonical) → canonical name
 * This is computed once at module load time for O(1) lookups
 */
function buildAliasMap(): Map<string, string> {
  const map = new Map<string, string>();

  // Add all canonical names and their aliases
  Object.entries(ParcelFieldCatalog).forEach(([canonical, metadata]) => {
    // Add the canonical name itself
    map.set(canonical, canonical);

    // Add all explicit aliases
    metadata.aliases.forEach((alias) => {
      map.set(alias, canonical);
    });

    // Add the DB column name as an alias
    map.set(metadata.dbColumn, canonical);
  });

  return map;
}

const aliasMap = buildAliasMap();

/**
 * Resolve any field name (canonical, alias, snake_case, camelCase, or DB column) to the canonical field name
 * Returns null if the field is not recognized
 *
 * @param input The field name to resolve (may be alias, camelCase, snake_case, or DB column)
 * @returns The canonical field name, or null if not found
 */
export function resolveField(input: string): string | null {
  if (!input) return null;
  return aliasMap.get(input) ?? null;
}

/**
 * Check if a name is a valid canonical field name
 *
 * @param name The field name to validate
 * @returns true if the name is a known canonical field, false otherwise
 */
export function isValidField(name: string): boolean {
  return name in ParcelFieldCatalog;
}
