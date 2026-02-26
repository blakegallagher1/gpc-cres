/**
 * Concurrency control utility for parallel task execution with configurable limits.
 *
 * Usage:
 *   const results = await runWithConcurrency([
 *     () => fetch(...),
 *     () => fetch(...),
 *   ], 5); // max 5 concurrent
 */

export async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  maxConcurrent: number = 5,
): Promise<PromiseSettledResult<T>[]> {
  const limit = Math.max(1, maxConcurrent);
  const results: Array<PromiseSettledResult<T>> = new Array(tasks.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      try {
        const value = await tasks[currentIndex]();
        results[currentIndex] = { status: "fulfilled", value };
      } catch (reason) {
        results[currentIndex] = { status: "rejected", reason };
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, () => worker()),
  );

  return results;
}
