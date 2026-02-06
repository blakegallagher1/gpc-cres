import { describe, expect, it } from "vitest";

import { hashContent } from "../hash.js";

describe("hashContent", () => {
  it("returns a 64-char hex string (sha256)", () => {
    const hash = hashContent("hello world");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic for the same input", () => {
    const a = hashContent("some text content");
    const b = hashContent("some text content");
    expect(a).toBe(b);
  });

  it("normalizes whitespace so formatting differences are ignored", () => {
    const a = hashContent("hello   world");
    const b = hashContent("hello world");
    expect(a).toBe(b);
  });

  it("normalizes leading/trailing whitespace", () => {
    const a = hashContent("  hello world  ");
    const b = hashContent("hello world");
    expect(a).toBe(b);
  });

  it("normalizes newlines and tabs to single spaces", () => {
    const a = hashContent("line one\n\nline two\ttab");
    const b = hashContent("line one line two tab");
    expect(a).toBe(b);
  });

  it("produces different hashes for different content", () => {
    const a = hashContent("content A");
    const b = hashContent("content B");
    expect(a).not.toBe(b);
  });

  it("accepts Uint8Array and hashes raw bytes", () => {
    const bytes = new TextEncoder().encode("hello world");
    const hash = hashContent(bytes);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces different hashes for string vs raw bytes of same text", () => {
    // String path normalizes whitespace; Uint8Array path does not.
    // "hello  world" as string normalizes to "hello world" then hashes.
    // As Uint8Array, it hashes "hello  world" (two spaces) directly.
    const fromString = hashContent("hello  world");
    const fromBytes = hashContent(new TextEncoder().encode("hello  world"));
    expect(fromString).not.toBe(fromBytes);
  });
});
