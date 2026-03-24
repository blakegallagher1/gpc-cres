import { Env } from "./types";

interface ProbeResult {
  name: string;
  ok: boolean;
  latency_ms: number;
  error?: string;
}

async function probe(url: string, headers: Record<string, string>, timeoutMs: number): Promise<ProbeResult> {
  const start = Date.now();
  const name = new URL(url).hostname;
  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { name, ok: res.ok, latency_ms: Date.now() - start };
  } catch (err) {
    return { name, ok: false, latency_ms: Date.now() - start, error: String(err) };
  }
}

export async function runHealthCheck(env: Env): Promise<{
  gateway_ok: boolean;
  tiles_ok: boolean;
  latency_ms: number;
  probes: ProbeResult[];
  action_taken: string | null;
}> {
  const upstreamHeaders: Record<string, string> = {
    "Authorization": `Bearer ${env.LOCAL_API_KEY}`,
  };
  if (env.CF_ACCESS_CLIENT_ID) {
    upstreamHeaders["CF-Access-Client-Id"] = env.CF_ACCESS_CLIENT_ID;
  }
  if (env.CF_ACCESS_CLIENT_SECRET) {
    upstreamHeaders["CF-Access-Client-Secret"] = env.CF_ACCESS_CLIENT_SECRET;
  }

  const probes = await Promise.all([
    probe(`${env.UPSTREAM_GATEWAY_URL}/health`, upstreamHeaders, 5000),
    probe("https://tiles.gallagherpropco.com/health", {}, 5000),
  ]);

  const gateway_ok = probes[0].ok;
  const tiles_ok = probes[1].ok;
  const latency_ms = Math.max(...probes.map(p => p.latency_ms));

  let action_taken: string | null = null;

  // Auto-recovery: try restart via admin API if gateway is down
  if (!gateway_ok) {
    try {
      const restartRes = await fetch(
        `${env.UPSTREAM_GATEWAY_URL}/admin/containers/gateway/restart`,
        { method: "POST", headers: upstreamHeaders, signal: AbortSignal.timeout(5000) }
      );
      action_taken = restartRes.ok ? "restart_attempted" : "restart_failed";
    } catch {
      action_taken = "restart_unreachable";
    }
  }

  return { gateway_ok, tiles_ok, latency_ms, probes, action_taken };
}

export async function saveHealthCheck(db: D1Database, result: Awaited<ReturnType<typeof runHealthCheck>>) {
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(
    `INSERT INTO health_checks (checked_at, gateway_ok, tiles_ok, latency_ms, error, action_taken)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    now,
    result.gateway_ok ? 1 : 0,
    result.tiles_ok ? 1 : 0,
    result.latency_ms,
    result.probes.filter(p => !p.ok).map(p => `${p.name}: ${p.error}`).join("; ") || null,
    result.action_taken
  ).run();

  // Prune entries older than 7 days
  const cutoff = now - 7 * 24 * 60 * 60;
  await db.prepare("DELETE FROM health_checks WHERE checked_at < ?").bind(cutoff).run();
}
