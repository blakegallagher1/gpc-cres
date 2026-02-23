import { describe, expect, it } from "vitest";
import { trimToolOutput } from "./toolOutputTrimmer.js";

describe("tool output trimmer", () => {
  it("trims oversized strings and nested arrays", () => {
    const input = {
      message: "x".repeat(200),
      nested: Array.from({ length: 20 }, (_, index) => ({ index, text: "value" })),
    };

    const result = trimToolOutput(input, {
      maxDepth: 4,
      maxObjectKeys: 8,
      maxArrayItems: 3,
      maxStringLength: 32,
      maxSerializedLength: 512,
    });

    expect(result.trimmed).toBe(true);
    expect(result.originalSerializedLength).toBeGreaterThan(result.trimmedSerializedLength);

    const value = result.value as Record<string, unknown>;
    expect(typeof value.message).toBe("string");
    expect((value.message as string).includes("[truncated]")).toBe(true);
    expect(Array.isArray(value.nested)).toBe(true);
    expect((value.nested as unknown[]).length).toBe(4);
  });
});

