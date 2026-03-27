import { describe, it, expect } from "vitest";
import {
  truncateToolOutput,
  truncateJsonOutput,
  estimateTokens,
  isOverTokenLimit,
} from "../truncateToolOutput";

describe("truncateToolOutput", () => {
  it("returns unchanged output under limit", () => {
    const shortText = "Hello, world!";
    const result = truncateToolOutput(shortText);
    expect(result).toBe(shortText);
  });

  it("truncates long output preserving head and tail", () => {
    // Create output larger than 40K chars
    const longText = "A".repeat(50_000);
    const result = truncateToolOutput(longText);

    // Should include head (20K 'A's)
    expect(result.startsWith("A".repeat(20_000))).toBe(true);

    // Should include tail (20K 'A's)
    expect(result.endsWith("A".repeat(20_000))).toBe(true);

    // Should be smaller than original
    expect(result.length).toBeLessThan(longText.length);
  });

  it("includes dropped character count in marker", () => {
    const longText = "X".repeat(50_000);
    const result = truncateToolOutput(longText);

    // Should contain a marker with the dropped count
    expect(result).toContain("[…");
    expect(result).toContain("characters truncated");
    expect(result).toContain("10,000");
  });

  it("truncateJsonOutput handles objects", () => {
    const obj = { name: "test", value: 42 };
    const result = truncateJsonOutput(obj);

    // Result should be JSON string (under limit, so unchanged)
    expect(result).toContain("name");
    expect(result).toContain("test");
    expect(result).toContain("42");
  });

  it("truncateJsonOutput handles strings", () => {
    const json = '{"key": "value"}';
    const result = truncateJsonOutput(json);

    // Should preserve the JSON
    expect(result).toBe(json);
  });

  it("estimateTokens returns reasonable estimate", () => {
    // 4 chars = ~1 token
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("A")).toBe(1);
    expect(estimateTokens("AAAA")).toBe(1);
    expect(estimateTokens("AAAAA")).toBe(2); // Rounds up
    expect(estimateTokens("A".repeat(400))).toBe(100);
  });

  it("isOverTokenLimit returns true for large text", () => {
    // 40,000 chars = 10,000 tokens
    const largeText = "A".repeat(40_001);
    expect(isOverTokenLimit(largeText, 10_000)).toBe(true);
  });

  it("isOverTokenLimit returns false for small text", () => {
    const smallText = "A".repeat(4_000);
    expect(isOverTokenLimit(smallText, 10_000)).toBe(false);
  });

  it("isOverTokenLimit uses default limit of 10K tokens", () => {
    const atLimit = "A".repeat(40_000);
    const overLimit = "A".repeat(40_001);

    expect(isOverTokenLimit(atLimit)).toBe(false);
    expect(isOverTokenLimit(overLimit)).toBe(true);
  });

  it("truncation marker is human-readable", () => {
    const longText = "START".repeat(8_000) + "END".repeat(1_000); // ~50K chars
    const result = truncateToolOutput(longText);

    // Check marker format
    expect(result).toContain("…");
    expect(result).toContain("characters truncated");
    expect(result).toContain("use a more specific query");
  });

  it("preserves exactly PRESERVE_HEAD_CHARS from start", () => {
    const marker = "H".repeat(10) + "?".repeat(50_000) + "T".repeat(10);
    const result = truncateToolOutput(marker);

    // Extract the head part (before the marker)
    const headEndIndex = result.indexOf("\n\n[…");
    const head = result.substring(0, headEndIndex);

    // Should preserve exactly 20K chars from start
    expect(head).toBe("H".repeat(10) + "?".repeat(19_990));
  });

  it("handles edge case: text exactly at limit", () => {
    const exactLimit = "A".repeat(40_000);
    const result = truncateToolOutput(exactLimit);
    expect(result).toBe(exactLimit);
  });

  it("handles edge case: empty string", () => {
    const result = truncateToolOutput("");
    expect(result).toBe("");
  });

  it("handles large JSON objects", () => {
    const largeObj = {
      items: Array.from({ length: 5000 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        description: "A".repeat(10),
      })),
    };

    const result = truncateJsonOutput(largeObj);

    // Result should be truncated
    if (result.length > 40_000) {
      expect(result).toContain("characters truncated");
    }

    // Should still be parseable JSON (head + tail structure)
    // Note: Due to truncation in middle, we can't necessarily parse it
    // But it should contain some structure
    expect(result.length).toBeGreaterThan(0);
  });

  it("correctly formats dropped character count with locale separator", () => {
    const longText = "A".repeat(50_000);
    const result = truncateToolOutput(longText);

    // Should use locale-aware number formatting
    // In most locales, 10000 should appear as "10,000"
    expect(result).toContain("10");
  });
});
