import { describe, expect, it } from "vitest";
import { collapseRepeatedTextArtifacts } from "./collapseRepeatedText.js";

describe("collapseRepeatedTextArtifacts", () => {
  it("leaves valid JSON unchanged", () => {
    const json = '{"task_understanding":{"summary":"x"}}';
    expect(collapseRepeatedTextArtifacts(json)).toBe(json);
  });

  it("collapses doubled words", () => {
    expect(collapseRepeatedTextArtifacts("I I pulled pulled the the lowest")).toBe(
      "I pulled the lowest",
    );
  });

  it("collapses hyphen segment doubles", () => {
    expect(collapseRepeatedTextArtifacts("lowest-cost-cost local")).toBe("lowest-cost local");
  });

  it("collapses glued lowercase doubles", () => {
    expect(collapseRepeatedTextArtifacts("evidencevidence here")).toBe("evidence here");
  });

  it("dedupes consecutive identical lines", () => {
    expect(collapseRepeatedTextArtifacts("a\na\nb")).toBe("a\nb");
  });
});
