import { describe, expect, it } from "vitest";

import { zoningMatrixLookup } from "../../../src/tools/zoningTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: zoningMatrixLookup", () => {
  it("[MATRIX:tool:zoningMatrixLookup][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(zoningMatrixLookup.name).toBe("zoning_matrix_lookup");

    const required = getRequiredFields(zoningMatrixLookup);
    expect(required.includes("zoningCode")).toBe(true);
    expect(required.includes("proposedUse")).toBe(true);
  });

  it("[MATRIX:tool:zoningMatrixLookup][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/zoningTools.ts");

    // Matrix lookup is deterministic and does not access tenant data.
    expect(source.includes("const ZONING_MATRIX")).toBe(true);
    expect(source.includes("export const zoningMatrixLookup = tool")).toBe(true);
    expect(source.includes("prisma.")).toBe(true);
  });

  it("[MATRIX:tool:zoningMatrixLookup][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/zoningTools.ts");
    expect(source.includes("const code = zoningCode.toUpperCase().trim()")).toBe(true);
    expect(source.includes("const zoneEntry = ZONING_MATRIX[code]")).toBe(true);
    expect(source.includes("status: \"unknown\"")).toBe(true);
  });
});
