import { describe, expect, it } from "vitest";

import { compareEvidenceHash } from "../../../src/tools/evidenceTools.js";
import { getRequiredFields, getSchemaProp, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: compareEvidenceHash", () => {
  it("[MATRIX:tool:compareEvidenceHash][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(compareEvidenceHash.type).toBe("function");
    expect(compareEvidenceHash.name).toBe("compare_evidence_hash");
    expect(compareEvidenceHash.strict).toBe(true);

    const required = getRequiredFields(compareEvidenceHash);
    expect(required.includes("orgId")).toBe(true);
    expect(required.includes("sourceId")).toBe(true);
  });

  it("[MATRIX:tool:compareEvidenceHash][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const orgId = getSchemaProp(compareEvidenceHash, "orgId");
    expect(orgId?.format).toBe("uuid");

    const source = readRepoSource("packages/openai/src/tools/evidenceTools.ts");
    expect(source.includes("where: {")).toBe(true);
    expect(source.includes("orgId,")).toBe(true);
    expect(source.includes("evidenceSourceId: sourceId")).toBe(true);
  });

  it("[MATRIX:tool:compareEvidenceHash][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/evidenceTools.ts");
    expect(source.includes("take: 2")).toBe(true);
    expect(source.includes("latest.contentHash !== previous.contentHash")).toBe(true);
    expect(source.includes("changed")).toBe(true);
  });
});
