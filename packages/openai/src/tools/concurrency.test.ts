import { describe, expect, it } from "vitest";

import { runWithConcurrency } from "./concurrency.js";

describe("runWithConcurrency", () => {
  it("preserves task order, satisfies all tasks, and respects max concurrency", async () => {
    let active = 0;
    let maxActive = 0;

    const createTask = (value: number, delayMs: number) => async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      });
      active -= 1;
      return value;
    };

    const tasks = [
      createTask(1, 30),
      createTask(2, 20),
      createTask(3, 10),
    ];

    const results = await runWithConcurrency(tasks, 2);

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ status: "fulfilled", value: 1 });
    expect(results[1]).toEqual({ status: "fulfilled", value: 2 });
    expect(results[2]).toEqual({ status: "fulfilled", value: 3 });
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("returns rejected settled results instead of throwing", async () => {
    const boom = new Error("boom");
    const tasks = [
      async () => "first",
      async () => {
        throw boom;
      },
      async () => "third",
    ];

    const results = await runWithConcurrency(tasks, 5);

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ status: "fulfilled", value: "first" });
    expect(results[1].status).toBe("rejected");
    expect((results[1] as PromiseRejectedResult).reason).toBe(boom);
    expect(results[2]).toEqual({ status: "fulfilled", value: "third" });
  });
});
