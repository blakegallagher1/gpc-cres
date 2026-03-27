/**
 * Auto-threading wrapper for synchronous tool functions (P3 Pattern 4).
 * Prevents blocking the Node.js event loop.
 */
export function autoThread<TArgs, TResult>(
  fn: (args: TArgs) => TResult,
): (args: TArgs) => Promise<TResult> {
  return (args: TArgs) =>
    new Promise<TResult>((resolve, reject) => {
      setImmediate(() => {
        try {
          resolve(fn(args));
        } catch (err) {
          reject(err);
        }
      });
    });
}

export function isSyncFunction<TArgs extends readonly unknown[]>(
  fn: (...args: TArgs) => unknown,
): boolean {
  return fn.constructor.name !== "AsyncFunction";
}
