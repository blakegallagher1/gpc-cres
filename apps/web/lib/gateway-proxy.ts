import { getCloudflareAccessHeadersFromEnv } from "@/lib/server/propertyDbEnv";

/**
 * Shared proxy helpers for Next.js API routes that forward to the Gateway
 * (api.gallagherpropco.com via Cloudflare Tunnel).
 *
 * PRD: Zero-Cost Local Compute — Vercel is UI-only; all data via Gateway.
 * Uses LOCAL_API_URL and LOCAL_API_KEY (server-side only).
 */

export type GatewayAuth = { orgId: string; userId: string };

export function getGatewayConfig(): { url: string; key: string } | null {
  const url = process.env.LOCAL_API_URL?.trim();
  const key = process.env.LOCAL_API_KEY?.trim();
  if (!url || !key) return null;
  return {
    url: url.replace(/\/$/, ""),
    key,
  };
}

export function gatewayHeaders(
  key: string,
  auth: GatewayAuth,
  options?: { contentType?: "json" }
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "X-Org-Id": auth.orgId,
    "X-User-Id": auth.userId,
    ...getCloudflareAccessHeadersFromEnv(),
  };
  if (options?.contentType === "json") {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

export function requireGatewayConfig(routeTag: string): { url: string; key: string } {
  const config = getGatewayConfig();
  if (!config) {
    throw new Error(
      `[${routeTag}] Deals API requires LOCAL_API_URL and LOCAL_API_KEY in the environment`
    );
  }
  return config;
}
