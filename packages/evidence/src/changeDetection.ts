/**
 * Change detection utilities — shared logic used by the cron job.
 * Extracted here to be testable independently of the API route.
 */

export type SourceScanResult = {
  url: string;
  jurisdictionId: string;
  jurisdictionName: string;
  purpose: string;
  changed: boolean;
  firstCapture: boolean;
  error: string | null;
  unreachable: boolean;
};

/**
 * A change is "material" if the content actually changed (not a first capture)
 * and the fetch succeeded.
 *
 * First captures return changed=true from the evidence system but aren't real changes —
 * they're just the initial baseline snapshot.
 */
export function isMaterialChange(result: SourceScanResult): boolean {
  return result.changed && !result.firstCapture && !result.error;
}

/**
 * Compute summary statistics from scan results.
 */
export function computeScanStats(results: SourceScanResult[]) {
  const total = results.length;
  const unreachable = results.filter((r) => r.unreachable).length;
  const materialChanges = results.filter(isMaterialChange);
  const firstCaptures = results.filter((r) => r.firstCapture);
  const unreachableRatio = total > 0 ? unreachable / total : 0;
  const networkAlert = unreachableRatio > 0.5;

  return {
    total,
    unreachable,
    materialChangeCount: materialChanges.length,
    firstCaptureCount: firstCaptures.length,
    unreachableRatio,
    networkAlert,
    materialChanges,
    firstCaptures,
  };
}

/**
 * Group material changes by jurisdiction ID.
 */
export function groupChangesByJurisdiction(
  changes: SourceScanResult[]
): Map<string, SourceScanResult[]> {
  const map = new Map<string, SourceScanResult[]>();
  for (const change of changes) {
    const existing = map.get(change.jurisdictionId) ?? [];
    existing.push(change);
    map.set(change.jurisdictionId, existing);
  }
  return map;
}

/**
 * Wrap a promise with a timeout. Rejects after timeoutMs.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout after ${timeoutMs}ms: ${label}`)),
      timeoutMs
    );
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Retry with exponential backoff. Wraps a promise factory.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  label: string
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        const delay = Math.min(1000 * 2 ** (attempt - 1), 10_000);
        console.warn(
          `[change-detection] ${label} attempt ${attempt} failed, retrying in ${delay}ms...`
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}
