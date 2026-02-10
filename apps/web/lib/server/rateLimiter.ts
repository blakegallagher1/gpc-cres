/**
 * Simple in-memory token bucket rate limiter.
 *
 * Keyed by route name. Node runtime only (not Edge).
 * Tokens refill linearly; burst capacity allows short spikes.
 */

const DEFAULT_CAPACITY = 10; // max burst (10 req/sec peak)
const DEFAULT_REFILL_RATE = 1.67; // tokens per second (~100 req/min sustained)

interface Bucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number;
}

const buckets = new Map<string, Bucket>();

function refill(bucket: Bucket): void {
  const now = Date.now();
  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(
    bucket.capacity,
    bucket.tokens + elapsed * bucket.refillRate,
  );
  bucket.lastRefill = now;
}

/**
 * Returns `true` if the request is allowed, `false` if rate-limited.
 */
export function checkRateLimit(
  key: string,
  capacity = DEFAULT_CAPACITY,
  refillRate = DEFAULT_REFILL_RATE,
): boolean {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = {
      tokens: capacity,
      lastRefill: Date.now(),
      capacity,
      refillRate,
    };
    buckets.set(key, bucket);
  }
  refill(bucket);
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }
  return false;
}
