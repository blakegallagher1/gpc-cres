import { afterEach, describe, expect, it, vi } from "vitest";

import { withTimeout } from "../timeout";

describe("withTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns the resolved value before the timeout elapses", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 1_000, "fast")).resolves.toBe("ok");
  });

  it("propagates promise rejections", async () => {
    await expect(
      withTimeout(Promise.reject(new Error("boom")), 1_000, "failing"),
    ).rejects.toThrow("boom");
  });

  it("resolves to null when the timeout elapses", async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultPromise = withTimeout(new Promise<string>(() => {}), 50, "slow op");

    await vi.advanceTimersByTimeAsync(50);

    await expect(resultPromise).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      "[automation][timeout] slow op exceeded 50ms",
    );
  });

  it("invokes a cancel hook on timeout so late side effects can be suppressed", async () => {
    vi.useFakeTimers();

    let cancelled = false;
    let sideEffectRan = false;
    const promise = new Promise<string>((resolve) => {
      setTimeout(() => {
        if (!cancelled) {
          sideEffectRan = true;
          resolve("late");
        }
      }, 100);
    }) as Promise<string> & { cancel?: () => void };
    promise.cancel = () => {
      cancelled = true;
    };

    const resultPromise = withTimeout(promise, 50, "cancelable");

    await vi.advanceTimersByTimeAsync(50);
    await expect(resultPromise).resolves.toBeNull();

    await vi.advanceTimersByTimeAsync(50);
    expect(cancelled).toBe(true);
    expect(sideEffectRan).toBe(false);
  });
});
