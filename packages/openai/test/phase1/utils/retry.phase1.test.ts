import { describe, expect, it, vi } from "vitest";
import {
  computeExponentialBackoffDelayMs,
  parseRetryAfterHeaderMs,
  withExponentialBackoff,
} from "../../../src/utils/retry.js";

describe("Phase 1 Utils :: retry", () => {
  it("[MATRIX:utils:retry][PACK:backoff] computes exponential backoff with bounded jitter", () => {
    const d0 = computeExponentialBackoffDelayMs(0, {
      initialDelayMs: 1_000,
      maxDelayMs: 8_000,
      multiplier: 2,
      jitterRatio: 0.25,
      random: () => 0,
    });
    const d1 = computeExponentialBackoffDelayMs(1, {
      initialDelayMs: 1_000,
      maxDelayMs: 8_000,
      multiplier: 2,
      jitterRatio: 0.25,
      random: () => 1,
    });
    const d3 = computeExponentialBackoffDelayMs(3, {
      initialDelayMs: 1_000,
      maxDelayMs: 8_000,
      multiplier: 2,
      jitterRatio: 0.25,
      random: () => 0.5,
    });

    expect(d0).toBe(1_000);
    expect(d1).toBe(2_500);
    expect(d3).toBe(9_000);
  });

  it("[MATRIX:utils:retry][PACK:retry-after] parses Retry-After header as seconds and HTTP date", () => {
    const fixedNow = Date.parse("2026-02-16T00:00:00.000Z");
    const secondsMs = parseRetryAfterHeaderMs("3", fixedNow);
    const httpDateMs = parseRetryAfterHeaderMs(
      "Mon, 16 Feb 2026 00:00:05 GMT",
      fixedNow,
    );

    expect(secondsMs).toBe(3_000);
    expect(httpDateMs).toBe(5_000);
  });

  it("[MATRIX:utils:retry][PACK:policy] respects Retry-After for retry delay before succeeding", async () => {
    const sleepSpy = vi.fn(async () => {});
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({
        status: 429,
        headers: new Headers({ "retry-after": "2" }),
      })
      .mockResolvedValueOnce("ok");

    const result = await withExponentialBackoff(operation, {
      retries: 2,
      initialDelayMs: 1_000,
      maxDelayMs: 8_000,
      multiplier: 2,
      jitterRatio: 0,
      sleep: sleepSpy,
    });

    expect(result).toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleepSpy).toHaveBeenCalledTimes(1);
    expect(sleepSpy).toHaveBeenCalledWith(2_000);
  });
});
