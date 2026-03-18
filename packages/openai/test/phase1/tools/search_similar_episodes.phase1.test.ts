import { describe, expect, it } from "vitest";

import { search_similar_episodes } from "../../../src/tools/proceduralMemoryTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: search_similar_episodes", () => {
  it("[MATRIX:tool:search_similar_episodes][PACK:schema] validates the episodic search contract", () => {
    expect(search_similar_episodes.name).toBe("search_similar_episodes");

    const required = getRequiredFields(search_similar_episodes);
    expect(required.includes("query")).toBe(true);
    expect(required.includes("limit")).toBe(true);
  });

  it("[MATRIX:tool:search_similar_episodes][PACK:security] forwards internal auth headers and uses the knowledge route", () => {
    const source = readRepoSource("packages/openai/src/tools/proceduralMemoryTools.ts");

    expect(source.includes("buildMemoryToolHeaders(context)")).toBe(true);
    expect(source.includes("episodic_summary")).toBe(true);
    expect(source.includes("/api/knowledge")).toBe(true);
  });
});
