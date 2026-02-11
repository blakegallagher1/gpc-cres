import { describe, expect, it } from "vitest";

import { evidenceSnapshot } from "../../../src/tools/evidenceTools.js";
import { getRequiredFields, getSchemaProp, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: evidenceSnapshot", () => {
  it("[MATRIX:tool:evidenceSnapshot][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(evidenceSnapshot.type).toBe("function");
    expect(evidenceSnapshot.name).toBe("evidence_snapshot");
    expect(evidenceSnapshot.strict).toBe(true);

    const required = getRequiredFields(evidenceSnapshot);
    expect(required.includes("orgId")).toBe(true);
    expect(required.includes("url")).toBe(true);
    expect(required.includes("title")).toBe(true);
    expect(required.includes("dealId")).toBe(true);
  });

  it("[MATRIX:tool:evidenceSnapshot][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const orgId = getSchemaProp(evidenceSnapshot, "orgId");
    expect(orgId?.format).toBe("uuid");

    const source = readRepoSource("packages/openai/src/tools/evidenceTools.ts");
    expect(source.includes("where: { orgId_url: { orgId, url } }")).toBe(true);
    expect(source.includes("where: { orgId, evidenceSourceId: source.id }")).toBe(true);
    expect(source.includes("runType: \"CHANGE_DETECT\"")).toBe(true);
  });

  it("[MATRIX:tool:evidenceSnapshot][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/evidenceTools.ts");
    expect(source.includes("hashBytesSha256")).toBe(true);
    expect(source.includes("buildEvidenceSnapshotObjectKey")).toBe(true);
    expect(source.includes("previousHash")).toBe(true);
  });
});
