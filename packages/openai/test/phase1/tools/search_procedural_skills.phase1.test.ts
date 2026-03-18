import { describe, expect, it } from "vitest";

import { search_procedural_skills } from "../../../src/tools/proceduralMemoryTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: search_procedural_skills", () => {
  it("[MATRIX:tool:search_procedural_skills][PACK:schema] validates the procedural skill search contract", () => {
    expect(search_procedural_skills.name).toBe("search_procedural_skills");

    const required = getRequiredFields(search_procedural_skills);
    expect(required.includes("query")).toBe(true);
    expect(required.includes("limit")).toBe(true);
  });

  it("[MATRIX:tool:search_procedural_skills][PACK:security] forwards internal auth headers and uses the knowledge route", () => {
    const source = readRepoSource("packages/openai/src/tools/proceduralMemoryTools.ts");

    expect(source.includes("buildMemoryToolHeaders(context)")).toBe(true);
    expect(source.includes("procedural_skill")).toBe(true);
    expect(source.includes("/api/knowledge")).toBe(true);
  });
});
