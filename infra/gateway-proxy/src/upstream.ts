import { Env, UpstreamResult } from "./types";
import { upstreamHeaders } from "./auth";

const UPSTREAM_TIMEOUT_MS = 8000;

export async function proxyToUpstream(
  env: Env,
  method: string,
  path: string,
  body?: unknown,
  requestId?: string
): Promise<UpstreamResult> {
  const url = `${env.UPSTREAM_GATEWAY_URL}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method,
      headers: upstreamHeaders(env, requestId),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const raw = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }

    return { ok: res.ok, status: res.status, data, raw };
  } catch (err) {
    const message = err instanceof Error ? err.message : "upstream error";
    return { ok: false, status: 0, data: { error: message, type: err instanceof Error ? err.constructor.name : "unknown" }, raw: "" };
  } finally {
    clearTimeout(timeout);
  }
}
