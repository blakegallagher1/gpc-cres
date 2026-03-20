/**
 * Resolve a promise to null when it exceeds the configured timeout.
 * Rejections from the wrapped promise still propagate to the caller.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T | null> {
  const cancelablePromise = promise as Promise<T> & {
    cancel?: () => void;
  };

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cancelablePromise.cancel?.();
      console.warn(`[automation][timeout] ${label} exceeded ${ms}ms`);
      resolve(null);
    }, ms);

    cancelablePromise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
