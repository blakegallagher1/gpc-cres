import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useStableOptions } from "../useStableOptions";

describe("useStableOptions", () => {
  it("keeps stable references when only function props change", () => {
    const firstFn = vi.fn(() => "first");
    const secondFn = vi.fn(() => "second");

    const { result, rerender } = renderHook(
      ({ onClick, label }: { onClick: () => string; label: string }) =>
        useStableOptions({ onClick, label }),
      {
        initialProps: { onClick: firstFn, label: "same" },
      },
    );

    const firstOptions = result.current;
    const firstProxy = result.current.onClick;

    rerender({ onClick: secondFn, label: "same" });

    expect(result.current).toBe(firstOptions);
    expect(result.current.onClick).toBe(firstProxy);
    expect(result.current.onClick()).toBe("second");
    expect(firstFn).not.toHaveBeenCalled();
    expect(secondFn).toHaveBeenCalledTimes(1);
  });

  it("changes reference when non-function data changes", () => {
    const handler = vi.fn();
    const { result, rerender } = renderHook(
      ({ count }: { count: number }) =>
        useStableOptions({ onClick: handler, count }),
      {
        initialProps: { count: 1 },
      },
    );

    const firstOptions = result.current;
    rerender({ count: 2 });

    expect(result.current).not.toBe(firstOptions);
    expect(result.current.count).toBe(2);
  });

  it("keeps reference when nested data is deeply equal", () => {
    const handler = vi.fn();
    const { result, rerender } = renderHook(
      ({ nested }: { nested: { filters: string[]; flags: { strict: boolean } } }) =>
        useStableOptions({ onClick: handler, nested }),
      {
        initialProps: {
          nested: {
            filters: ["a", "b"],
            flags: { strict: true },
          },
        },
      },
    );

    const firstOptions = result.current;

    rerender({
      nested: {
        filters: ["a", "b"],
        flags: { strict: true },
      },
    });

    expect(result.current).toBe(firstOptions);
  });
});
