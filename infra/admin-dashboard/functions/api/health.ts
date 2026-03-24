interface Env {
  GATEWAY_PROXY_URL: string;
  UPSTREAM_GATEWAY_URL: string;
  DB: D1Database;
}

interface HealthCheckResult {
  status: string;
  checked_at: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  // Probe gateway proxy health
  let proxyHealth: Record<string, unknown> = { status: "down" };
  const startTime = Date.now();
  try {
    const res = await fetch(`${env.GATEWAY_PROXY_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const responseTime = Date.now() - startTime;
    proxyHealth = (await res.json()) as Record<string, unknown>;
    proxyHealth.response_time_ms = responseTime;
  } catch (err) {
    /* down */
  }

  // Get D1 stats
  let syncStatus: Record<string, unknown> | null = null;
  let recentChecks: HealthCheckResult[] = [];
  try {
    const statusRow = await env.DB.prepare("SELECT * FROM sync_status WHERE id = 'main'").first();
    syncStatus = (statusRow || {}) as Record<string, unknown>;

    const checksResult = await env.DB.prepare(
      "SELECT status, checked_at FROM health_checks ORDER BY checked_at DESC LIMIT 720"
    ).all();
    recentChecks = (checksResult.results as HealthCheckResult[]) || [];
  } catch (err) {
    /* D1 unavailable */
  }

  return Response.json(
    {
      proxy: proxyHealth,
      sync: syncStatus,
      health_history: recentChecks,
    },
    { headers }
  );
};
