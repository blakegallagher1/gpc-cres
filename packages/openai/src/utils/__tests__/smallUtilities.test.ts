import { describe, it, expect } from "vitest";
import {
  mergeDescriptions,
} from "../descriptionMerge";
import {
  autoThread,
  isSyncFunction,
} from "../autoThread";
import {
  selectCompactionMode,
  type CompactionMode,
} from "../compactionMode";
import {
  isContainerExpired,
  getRemainingTtlMs,
  shouldRecreateContainer,
} from "../containerTtl";

describe("mergeDescriptions", () => {
  it("returns runtime override first", () => {
    const result = mergeDescriptions({
      runtimeOverride: "runtime",
      skillManifest: "skill",
      zodDescribe: "zod",
      jsdoc: "jsdoc",
    });
    expect(result).toBe("runtime");
  });

  it("falls through to skill manifest", () => {
    const result = mergeDescriptions({
      skillManifest: "skill",
      zodDescribe: "zod",
      jsdoc: "jsdoc",
    });
    expect(result).toBe("skill");
  });

  it("falls through to zodDescribe", () => {
    const result = mergeDescriptions({
      zodDescribe: "zod",
      jsdoc: "jsdoc",
    });
    expect(result).toBe("zod");
  });

  it("falls through to jsdoc", () => {
    const result = mergeDescriptions({
      jsdoc: "jsdoc",
    });
    expect(result).toBe("jsdoc");
  });

  it("returns null when all empty", () => {
    const result = mergeDescriptions({});
    expect(result).toBeNull();
  });
});

describe("autoThread", () => {
  it("wraps sync function as async", async () => {
    const syncFn = (x: number) => x * 2;
    const asyncFn = autoThread(syncFn);
    const result = await asyncFn(5);
    expect(result).toBe(10);
  });

  it("preserves return value", async () => {
    const syncFn = (obj: { name: string }) => ({ ...obj, processed: true });
    const asyncFn = autoThread(syncFn);
    const result = await asyncFn({ name: "test" });
    expect(result).toEqual({ name: "test", processed: true });
  });

  it("catches errors", async () => {
    const syncFn = () => {
      throw new Error("test error");
    };
    const asyncFn = autoThread(syncFn);
    await expect(asyncFn({} as never)).rejects.toThrow("test error");
  });
});

describe("isSyncFunction", () => {
  it("detects sync functions", () => {
    const syncFn = () => "sync";
    expect(isSyncFunction(syncFn)).toBe(true);
  });

  it("detects async functions", () => {
    const asyncFn = async () => "async";
    expect(isSyncFunction(asyncFn)).toBe(false);
  });
});

describe("selectCompactionMode", () => {
  it("returns previous_response_id when available", () => {
    const result = selectCompactionMode({
      previousResponseId: "resp-123",
      responseWasStored: true,
    });
    expect(result).toBe("previous_response_id");
  });

  it("returns input when no response ID", () => {
    const result = selectCompactionMode({
      responseWasStored: true,
    });
    expect(result).toBe("input");
  });

  it("returns input when not stored", () => {
    const result = selectCompactionMode({
      previousResponseId: "resp-123",
      responseWasStored: false,
    });
    expect(result).toBe("input");
  });

  it("returns input when forced", () => {
    const result = selectCompactionMode({
      previousResponseId: "resp-123",
      responseWasStored: true,
      forceInputMode: true,
    });
    expect(result).toBe("input");
  });
});

describe("containerTtl", () => {
  it("isContainerExpired returns false for fresh container", () => {
    const now = Date.now();
    const createdAt = now - 1 * 60 * 1000; // 1 minute old
    expect(isContainerExpired(createdAt, now)).toBe(false);
  });

  it("isContainerExpired returns true for old container", () => {
    const now = Date.now();
    const createdAt = now - 25 * 60 * 1000; // 25 minutes old
    expect(isContainerExpired(createdAt, now)).toBe(true);
  });

  it("getRemainingTtlMs returns positive for fresh container", () => {
    const now = Date.now();
    const createdAt = now - 1 * 60 * 1000; // 1 minute old
    const remaining = getRemainingTtlMs(createdAt, now);
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThan(20 * 60 * 1000); // less than 20 minutes
  });

  it("getRemainingTtlMs returns 0 for expired container", () => {
    const now = Date.now();
    const createdAt = now - 25 * 60 * 1000; // 25 minutes old
    const remaining = getRemainingTtlMs(createdAt, now);
    expect(remaining).toBe(0);
  });

  it("shouldRecreateContainer returns true with <1min remaining", () => {
    const now = Date.now();
    const createdAt = now - 20 * 60 * 1000 - 1500; // Just under TTL with safety margin
    expect(shouldRecreateContainer(createdAt, now)).toBe(true);
  });
});
