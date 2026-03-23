import { describe, it, expect } from "vitest";
import {
  ParcelFieldCatalog,
  resolveField,
  isValidField,
  FieldMetadata,
} from "../fields";

describe("ParcelFieldCatalog", () => {
  it("should contain all 9 known fields", () => {
    const expectedFields = [
      "parcelId",
      "address",
      "owner",
      "acres",
      "zoningType",
      "parish",
      "assessedValue",
      "latitude",
      "longitude",
    ];

    expectedFields.forEach((field) => {
      expect(ParcelFieldCatalog).toHaveProperty(field);
    });

    expect(Object.keys(ParcelFieldCatalog)).toHaveLength(9);
  });

  it("should have correct metadata for each field", () => {
    const expectedMetadata: Record<string, Partial<FieldMetadata>> = {
      parcelId: {
        dbColumn: "p_parcel_id",
        type: "string",
      },
      address: {
        dbColumn: "site_addr",
        type: "string",
      },
      owner: {
        dbColumn: "owner_name",
        type: "string",
      },
      acres: {
        dbColumn: "area_acres",
        type: "number",
      },
      zoningType: {
        dbColumn: "zoning_type",
        type: "string",
      },
      parish: {
        dbColumn: "parish",
        type: "string",
      },
      assessedValue: {
        dbColumn: "assessed_value",
        type: "number",
      },
      latitude: {
        dbColumn: "centroid_lat",
        type: "number",
      },
      longitude: {
        dbColumn: "centroid_lng",
        type: "number",
      },
    };

    Object.entries(expectedMetadata).forEach(([field, expected]) => {
      const metadata = ParcelFieldCatalog[field];
      expect(metadata.dbColumn).toBe(expected.dbColumn);
      expect(metadata.type).toBe(expected.type);
    });
  });

  it("should have aliases for each field with variants", () => {
    // Fields that should have aliases
    expect(ParcelFieldCatalog.parcelId.aliases).toContain("parcel_id");
    expect(ParcelFieldCatalog.parcelId.aliases).toContain("id");

    expect(ParcelFieldCatalog.address.aliases).toContain("site_addr");
    expect(ParcelFieldCatalog.address.aliases).toContain("siteAddr");

    expect(ParcelFieldCatalog.owner.aliases).toContain("owner_name");
    expect(ParcelFieldCatalog.owner.aliases).toContain("ownerName");

    expect(ParcelFieldCatalog.acres.aliases).toContain("area_acres");
    expect(ParcelFieldCatalog.acres.aliases).toContain("areaAcres");

    expect(ParcelFieldCatalog.zoningType.aliases).toContain("zoning_type");
    expect(ParcelFieldCatalog.zoningType.aliases).toContain("zoning");

    expect(ParcelFieldCatalog.assessedValue.aliases).toContain(
      "assessed_value"
    );
    expect(ParcelFieldCatalog.assessedValue.aliases).toContain("assessedValue");

    expect(ParcelFieldCatalog.latitude.aliases).toContain("centroid_lat");
    expect(ParcelFieldCatalog.latitude.aliases).toContain("lat");

    expect(ParcelFieldCatalog.longitude.aliases).toContain("centroid_lng");
    expect(ParcelFieldCatalog.longitude.aliases).toContain("lng");

    // parish has no aliases
    expect(ParcelFieldCatalog.parish.aliases).toEqual([]);
  });
});

describe("resolveField", () => {
  it("should resolve canonical names to themselves", () => {
    expect(resolveField("parcelId")).toBe("parcelId");
    expect(resolveField("address")).toBe("address");
    expect(resolveField("owner")).toBe("owner");
    expect(resolveField("acres")).toBe("acres");
    expect(resolveField("zoningType")).toBe("zoningType");
    expect(resolveField("parish")).toBe("parish");
    expect(resolveField("assessedValue")).toBe("assessedValue");
    expect(resolveField("latitude")).toBe("latitude");
    expect(resolveField("longitude")).toBe("longitude");
  });

  it("should resolve snake_case aliases to canonical names", () => {
    expect(resolveField("parcel_id")).toBe("parcelId");
    expect(resolveField("site_addr")).toBe("address");
    expect(resolveField("owner_name")).toBe("owner");
    expect(resolveField("area_acres")).toBe("acres");
    expect(resolveField("zoning_type")).toBe("zoningType");
    expect(resolveField("assessed_value")).toBe("assessedValue");
    expect(resolveField("centroid_lat")).toBe("latitude");
    expect(resolveField("centroid_lng")).toBe("longitude");
  });

  it("should resolve camelCase aliases to canonical names", () => {
    expect(resolveField("siteAddr")).toBe("address");
    expect(resolveField("ownerName")).toBe("owner");
    expect(resolveField("areaAcres")).toBe("acres");
    expect(resolveField("assessedValue")).toBe("assessedValue");
  });

  it("should resolve DB column names to canonical names", () => {
    expect(resolveField("p_parcel_id")).toBe("parcelId");
    expect(resolveField("site_addr")).toBe("address");
    expect(resolveField("owner_name")).toBe("owner");
    expect(resolveField("area_acres")).toBe("acres");
    expect(resolveField("zoning_type")).toBe("zoningType");
    expect(resolveField("parish")).toBe("parish");
    expect(resolveField("assessed_value")).toBe("assessedValue");
    expect(resolveField("centroid_lat")).toBe("latitude");
    expect(resolveField("centroid_lng")).toBe("longitude");
  });

  it("should resolve other common aliases", () => {
    expect(resolveField("id")).toBe("parcelId");
    expect(resolveField("zoning")).toBe("zoningType");
    expect(resolveField("lat")).toBe("latitude");
    expect(resolveField("lng")).toBe("longitude");
  });

  it("should return null for unknown fields", () => {
    expect(resolveField("unknownField")).toBeNull();
    expect(resolveField("fakeColumn")).toBeNull();
    expect(resolveField("randomAlias")).toBeNull();
  });

  it("should return null for empty or undefined input", () => {
    expect(resolveField("")).toBeNull();
  });
});

describe("isValidField", () => {
  it("should return true for canonical field names", () => {
    expect(isValidField("parcelId")).toBe(true);
    expect(isValidField("address")).toBe(true);
    expect(isValidField("owner")).toBe(true);
    expect(isValidField("acres")).toBe(true);
    expect(isValidField("zoningType")).toBe(true);
    expect(isValidField("parish")).toBe(true);
    expect(isValidField("assessedValue")).toBe(true);
    expect(isValidField("latitude")).toBe(true);
    expect(isValidField("longitude")).toBe(true);
  });

  it("should return false for aliases and DB column names", () => {
    // Aliases and DB columns are not "valid" canonical field names
    expect(isValidField("parcel_id")).toBe(false);
    expect(isValidField("site_addr")).toBe(false);
    expect(isValidField("owner_name")).toBe(false);
    expect(isValidField("area_acres")).toBe(false);
    expect(isValidField("zoning_type")).toBe(false);
    expect(isValidField("assessed_value")).toBe(false);
    expect(isValidField("centroid_lat")).toBe(false);
    expect(isValidField("centroid_lng")).toBe(false);
    expect(isValidField("siteAddr")).toBe(false);
    expect(isValidField("ownerName")).toBe(false);
    expect(isValidField("areaAcres")).toBe(false);
    expect(isValidField("id")).toBe(false);
    expect(isValidField("zoning")).toBe(false);
    expect(isValidField("lat")).toBe(false);
    expect(isValidField("lng")).toBe(false);
  });

  it("should return false for unknown fields", () => {
    expect(isValidField("unknownField")).toBe(false);
    expect(isValidField("fakeColumn")).toBe(false);
    expect(isValidField("randomAlias")).toBe(false);
  });
});
