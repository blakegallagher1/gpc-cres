import { GatewayClient } from "@entitlement-os/gateway-client";

let client: GatewayClient | null = null;

export function getGatewayClient(): GatewayClient {
  if (client) {
    return client;
  }

  const baseUrl = process.env.GATEWAY_PROXY_URL;
  const token = process.env.GATEWAY_PROXY_TOKEN;

  if (!baseUrl || !token) {
    throw new Error(
      "GATEWAY_PROXY_URL and GATEWAY_PROXY_TOKEN must be set for cartographer tools.",
    );
  }

  const rawTimeout = Number(process.env.PROPERTY_DB_GATEWAY_TIMEOUT_MS ?? "");
  const timeoutMs =
    Number.isFinite(rawTimeout) && rawTimeout > 0 ? Math.floor(rawTimeout) : 10_000;

  client = new GatewayClient({ baseUrl, token, timeoutMs });
  return client;
}
