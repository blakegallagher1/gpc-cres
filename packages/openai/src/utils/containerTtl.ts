/**
 * Container TTL management utilities (P3 Pattern 21).
 * Handles 20-minute container expiry with graceful detection.
 */
const CONTAINER_TTL_MS = 20 * 60 * 1000;
const SAFETY_MARGIN_MS = 2 * 60 * 1000;

export function isContainerExpired(createdAt: number, now?: number): boolean {
  return (now ?? Date.now()) - createdAt > CONTAINER_TTL_MS - SAFETY_MARGIN_MS;
}

export function getRemainingTtlMs(createdAt: number, now?: number): number {
  const elapsed = (now ?? Date.now()) - createdAt;
  return Math.max(0, CONTAINER_TTL_MS - SAFETY_MARGIN_MS - elapsed);
}

export function shouldRecreateContainer(createdAt: number, now?: number): boolean {
  return getRemainingTtlMs(createdAt, now) < 60_000; // Less than 1 min remaining
}
