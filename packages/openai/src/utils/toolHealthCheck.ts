/**
 * Health-based tool enable/disable (P2 Pattern 9).
 * Checks upstream service health and hides tools whose backends are offline.
 * Results are cached for 30s to avoid per-request overhead.
 */

export type HealthStatus = {
  healthy: boolean;
  checkedAt: number;
  reason?: string;
};

export type HealthCheckFn = () => Promise<HealthStatus>;

const CACHE_TTL_MS = 30_000; // 30 seconds
const healthCache = new Map<string, HealthStatus>();

/**
 * Register a health check for a tool.
 */
const healthChecks = new Map<string, HealthCheckFn>();

export function registerHealthCheck(toolName: string, checkFn: HealthCheckFn): void {
  healthChecks.set(toolName, checkFn);
}

/**
 * Check if a tool is enabled based on its backend health.
 * Returns true if no health check is registered (optimistic default).
 * Caches results for 30s.
 */
export async function isToolHealthy(toolName: string): Promise<boolean> {
  const checkFn = healthChecks.get(toolName);
  if (!checkFn) return true; // No check registered = always enabled

  const cached = healthCache.get(toolName);
  const now = Date.now();
  if (cached && now - cached.checkedAt < CACHE_TTL_MS) {
    return cached.healthy;
  }

  try {
    const status = await checkFn();
    healthCache.set(toolName, status);
    return status.healthy;
  } catch {
    const failStatus: HealthStatus = { healthy: false, checkedAt: now, reason: "Health check failed" };
    healthCache.set(toolName, failStatus);
    return false;
  }
}

/**
 * Filter a list of tools to only include healthy ones.
 */
export async function filterHealthyTools<T extends { name?: string }>(
  tools: T[],
): Promise<T[]> {
  const results = await Promise.all(
    tools.map(async (tool) => {
      const name = tool.name ?? "";
      const healthy = await isToolHealthy(name);
      return { tool, healthy };
    }),
  );
  return results.filter((r) => r.healthy).map((r) => r.tool);
}

/**
 * Get health status for all registered tools.
 */
export async function getAllHealthStatuses(): Promise<Record<string, HealthStatus>> {
  const statuses: Record<string, HealthStatus> = {};
  for (const [name, checkFn] of healthChecks.entries()) {
    try {
      const status = await checkFn();
      healthCache.set(name, status);
      statuses[name] = status;
    } catch {
      const failStatus: HealthStatus = { healthy: false, checkedAt: Date.now(), reason: "Check failed" };
      healthCache.set(name, failStatus);
      statuses[name] = failStatus;
    }
  }
  return statuses;
}

// For testing
export function _clearCache(): void {
  healthCache.clear();
}
export function _clearChecks(): void {
  healthChecks.clear();
}
