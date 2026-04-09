import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

import { validateSpatialSql, _testing } from "../sqlValidator";

const { extractTableReferences, enforceLimit, ALLOWED_TABLES, MAX_LIMIT } = _testing;

// ---------------------------------------------------------------------------
// validateSpatialSql — main public API
// ---------------------------------------------------------------------------

describe("validateSpatialSql", () => {
  // -- Rule 1: SELECT only --

  it("accepts a valid SELECT query", () => {
    const result = validateSpatialSql(
      "SELECT parcel_id, acreage, geom FROM ebr_parcels WHERE acreage > 5",
    );
    expect(result.valid).toBe(true);
    expect(result.sanitizedSql).toContain("SELECT");
    expect(result.errors).toHaveLength(0);
  });

  it("rejects INSERT statements", () => {
    const result = validateSpatialSql(
      "INSERT INTO ebr_parcels (parcel_id) VALUES ('test')",
    );
    expect(result.valid).toBe(false);
    expect(result.sanitizedSql).toBeNull();
    expect(result.errors[0]).toContain("Only SELECT");
  });

  it("rejects UPDATE statements", () => {
    const result = validateSpatialSql(
      "UPDATE ebr_parcels SET acreage = 10 WHERE parcel_id = 'test'",
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Only SELECT");
  });

  it("rejects DELETE statements", () => {
    const result = validateSpatialSql(
      "DELETE FROM ebr_parcels WHERE parcel_id = 'test'",
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Only SELECT");
  });

  it("rejects empty string", () => {
    const result = validateSpatialSql("");
    expect(result.valid).toBe(false);
  });

  it("rejects whitespace-only string", () => {
    const result = validateSpatialSql("   \n\t  ");
    expect(result.valid).toBe(false);
  });

  // -- Rule 2: no forbidden keywords --

  it("rejects DROP TABLE inside SELECT", () => {
    const result = validateSpatialSql(
      "SELECT * FROM ebr_parcels; DROP TABLE ebr_parcels",
    );
    expect(result.valid).toBe(false);
    // Caught by either multi-statement or forbidden keyword
  });

  it("rejects ALTER inside a subquery", () => {
    const result = validateSpatialSql(
      "SELECT * FROM ebr_parcels WHERE parcel_id IN (SELECT ALTER FROM parcels)",
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Forbidden keyword detected: ALTER");
  });

  it("rejects TRUNCATE", () => {
    const result = validateSpatialSql(
      "SELECT * FROM ebr_parcels WHERE TRUNCATE = true",
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("TRUNCATE");
  });

  it("rejects GRANT", () => {
    const result = validateSpatialSql(
      "SELECT * FROM ebr_parcels WHERE GRANT = 1",
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("GRANT");
  });

  // -- Rule 3: no multi-statement --

  it("rejects two statements separated by semicolon", () => {
    const result = validateSpatialSql(
      "SELECT 1 FROM ebr_parcels; SELECT 2 FROM parcels",
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Multiple SQL statements");
  });

  it("strips trailing semicolons safely", () => {
    const result = validateSpatialSql(
      "SELECT parcel_id FROM ebr_parcels;",
    );
    expect(result.valid).toBe(true);
    expect(result.sanitizedSql).not.toContain(";");
  });

  it("strips multiple trailing semicolons", () => {
    const result = validateSpatialSql(
      "SELECT parcel_id FROM ebr_parcels;;;",
    );
    expect(result.valid).toBe(true);
    expect(result.sanitizedSql).not.toContain(";");
  });

  // -- Rule 4: allowlisted tables --

  it("accepts all 11 allowlisted tables", () => {
    for (const table of ALLOWED_TABLES) {
      const result = validateSpatialSql(`SELECT * FROM ${table}`);
      expect(result.valid).toBe(true);
    }
  });

  it("rejects unknown table", () => {
    const result = validateSpatialSql(
      "SELECT * FROM secret_admin_table",
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("not in allowlist");
    expect(result.errors[0]).toContain("secret_admin_table");
  });

  it("rejects when any table in a JOIN is not allowed", () => {
    const result = validateSpatialSql(
      "SELECT p.* FROM ebr_parcels p JOIN users u ON p.id = u.parcel_id",
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("users");
  });

  it("allows a JOIN between two allowlisted tables", () => {
    const result = validateSpatialSql(
      "SELECT p.parcel_id, f.zone_code FROM ebr_parcels p JOIN flood_zones f ON ST_Intersects(p.geom, f.geom)",
    );
    expect(result.valid).toBe(true);
  });

  it("is case-insensitive for table matching", () => {
    const result = validateSpatialSql(
      "SELECT * FROM EBR_PARCELS",
    );
    expect(result.valid).toBe(true);
  });

  // -- Rule 5: LIMIT enforcement --

  it("injects default LIMIT 100 when missing", () => {
    const result = validateSpatialSql(
      "SELECT parcel_id FROM ebr_parcels",
    );
    expect(result.valid).toBe(true);
    expect(result.sanitizedSql).toContain("LIMIT 100");
  });

  it("preserves LIMIT when within max", () => {
    const result = validateSpatialSql(
      "SELECT parcel_id FROM ebr_parcels LIMIT 50",
    );
    expect(result.valid).toBe(true);
    expect(result.sanitizedSql).toContain("LIMIT 50");
  });

  it("clamps LIMIT to MAX_LIMIT when too large", () => {
    const result = validateSpatialSql(
      "SELECT parcel_id FROM ebr_parcels LIMIT 9999",
    );
    expect(result.valid).toBe(true);
    expect(result.sanitizedSql).toContain(`LIMIT ${MAX_LIMIT}`);
    expect(result.sanitizedSql).not.toContain("9999");
  });

  it("preserves LIMIT exactly at MAX_LIMIT", () => {
    const result = validateSpatialSql(
      `SELECT parcel_id FROM ebr_parcels LIMIT ${MAX_LIMIT}`,
    );
    expect(result.valid).toBe(true);
    expect(result.sanitizedSql).toContain(`LIMIT ${MAX_LIMIT}`);
  });

  // -- Edge cases --

  it("handles leading/trailing whitespace", () => {
    const result = validateSpatialSql(
      "  \n  SELECT parcel_id FROM ebr_parcels  \n  ",
    );
    expect(result.valid).toBe(true);
  });

  it("handles SELECT with case variations", () => {
    const result = validateSpatialSql(
      "select parcel_id from ebr_parcels",
    );
    expect(result.valid).toBe(true);
  });

  it("handles complex spatial query with ST_Within", () => {
    const result = validateSpatialSql(
      "SELECT parcel_id, acreage, geom FROM ebr_parcels WHERE ST_Within(geom, ST_MakeEnvelope(-91.2, 30.3, -91.0, 30.5, 4326)) AND acreage > 3",
    );
    expect(result.valid).toBe(true);
    expect(result.sanitizedSql).toContain("ST_Within");
  });

  it("handles subqueries referencing allowed tables", () => {
    const result = validateSpatialSql(
      "SELECT p.parcel_id FROM ebr_parcels p WHERE p.parcel_id IN (SELECT parcel_id FROM parcels WHERE acreage > 5)",
    );
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractTableReferences — internal helper
// ---------------------------------------------------------------------------

describe("extractTableReferences", () => {
  it("extracts single FROM table", () => {
    const tables = extractTableReferences("SELECT * FROM ebr_parcels");
    expect(tables).toEqual(["ebr_parcels"]);
  });

  it("extracts FROM + JOIN tables", () => {
    const tables = extractTableReferences(
      "SELECT * FROM ebr_parcels p JOIN flood_zones f ON p.id = f.id",
    );
    expect(tables).toContain("ebr_parcels");
    expect(tables).toContain("flood_zones");
  });

  it("extracts LEFT JOIN tables", () => {
    const tables = extractTableReferences(
      "SELECT * FROM ebr_parcels LEFT JOIN zoning_districts ON true",
    );
    expect(tables).toContain("ebr_parcels");
    expect(tables).toContain("zoning_districts");
  });

  it("ignores SQL keywords that follow JOIN", () => {
    // Shouldn't pick up SELECT, WHERE, etc. as table names
    const tables = extractTableReferences(
      "SELECT * FROM ebr_parcels WHERE acreage > 5",
    );
    expect(tables).not.toContain("WHERE");
    expect(tables).not.toContain("SELECT");
  });

  it("handles schema-qualified tables", () => {
    const tables = extractTableReferences(
      "SELECT * FROM public.ebr_parcels",
    );
    expect(tables).toContain("ebr_parcels");
  });

  it("returns empty for SELECT without FROM", () => {
    const tables = extractTableReferences("SELECT 1");
    expect(tables).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// enforceLimit — internal helper
// ---------------------------------------------------------------------------

describe("enforceLimit", () => {
  it("appends LIMIT 100 when none present", () => {
    const result = enforceLimit("SELECT * FROM ebr_parcels");
    expect(result).toBe("SELECT * FROM ebr_parcels LIMIT 100");
  });

  it("preserves existing LIMIT under max", () => {
    const result = enforceLimit("SELECT * FROM ebr_parcels LIMIT 25");
    expect(result).toBe("SELECT * FROM ebr_parcels LIMIT 25");
  });

  it("clamps LIMIT above max to MAX_LIMIT", () => {
    const result = enforceLimit("SELECT * FROM ebr_parcels LIMIT 1000");
    expect(result).toContain(`LIMIT ${MAX_LIMIT}`);
  });

  it("handles case-insensitive LIMIT", () => {
    const result = enforceLimit("SELECT * FROM ebr_parcels limit 50");
    expect(result).toContain("limit 50");
  });
});
