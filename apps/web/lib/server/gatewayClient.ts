import "server-only";
import { GatewayClient } from "@entitlement-os/gateway-client";

let _client: GatewayClient | null = null;

/**
 * Shared GatewayClient singleton for server-side use.
 * Talks to the CF Worker at gateway.gallagherpropco.com, which proxies
 * to the Windows gateway and falls back to D1 cache when offline.
 *
 * Env vars: GATEWAY_PROXY_URL, GATEWAY_PROXY_TOKEN
 */
export function getGatewayClient(): GatewayClient {
  if (!_client) {
    const baseUrl = process.env.GATEWAY_PROXY_URL;
    const token = process.env.GATEWAY_PROXY_TOKEN;

    if (!baseUrl || !token) {
      throw new Error(
        "GATEWAY_PROXY_URL and GATEWAY_PROXY_TOKEN must be set. " +
        "These point to the CF Worker gateway proxy at gateway.gallagherpropco.com.",
      );
    }

    const rawTimeout = Number(process.env.PROPERTY_DB_GATEWAY_TIMEOUT_MS ?? "");
    const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0
      ? Math.floor(rawTimeout)
      : 10_000;

    _client = new GatewayClient({ baseUrl, token, timeoutMs });
  }
  return _client;
}
