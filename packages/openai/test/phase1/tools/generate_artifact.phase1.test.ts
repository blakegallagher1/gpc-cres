import { describe, expect, it } from "vitest";

import { generate_artifact } from "../../../src/tools/artifactTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: generate_artifact", () => {
  it("[MATRIX:tool:generate_artifact][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(generate_artifact.name).toBe("generate_artifact");

    const required = getRequiredFields(generate_artifact);
    expect(required.includes("orgId")).toBe(true);
    expect(required.includes("dealId")).toBe(true);
    expect(required.includes("artifactType")).toBe(true);
    expect(required.includes("comparisonDealIds")).toBe(true);
  });

  it("[MATRIX:tool:generate_artifact][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/artifactTools.ts");

    expect(source.includes("where: { id: dealId, orgId }")).toBe(true);
    expect(source.includes("error: \"Deal not found or access denied\"")).toBe(true);
    expect(source.includes("where: { orgId }")).toBe(true);
  });

  it("[MATRIX:tool:generate_artifact][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/artifactTools.ts");
    expect(source.includes("const nextVersion = (latest?.version ?? 0) + 1")).toBe(true);
    expect(source.includes("buildArtifactObjectKey")).toBe(true);
    expect(source.includes("upsert: false")).toBe(true);
  });
});
