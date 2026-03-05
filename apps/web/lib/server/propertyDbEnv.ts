import "server-only";

export interface GatewayConfig {
  url: string;
  key: string;
}

const loggedHealthChecks = new Set<string>();

export function getCloudflareAccessHeadersFromEnv(): Record<string, string> {
  const clientId = process.env.CF_ACCESS_CLIENT_ID?.trim();
  const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return {};
  }
  if (isMissingOrPlaceholder(clientId) || isMissingOrPlaceholder(clientSecret)) {
    return {};
  }
  return {
    "CF-Access-Client-Id": clientId,
    "CF-Access-Client-Secret": clientSecret,
  };
}

export function isMissingOrPlaceholder(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === "undefined" ||
    normalized === "null" ||
    normalized === "placeholder" ||
    normalized === "***" ||
    normalized.includes("placeholder")
  );
}

/**
 * Returns the local FastAPI gateway config, or null if not configured.
 * Reads LOCAL_API_URL / LOCAL_API_KEY env vars.
 */
export function getPropertyDbConfigOrNull(): GatewayConfig | null {
  const url = process.env.LOCAL_API_URL?.trim();
  const key = process.env.LOCAL_API_KEY?.trim();
  if (!url || !key) return null;
  if (isMissingOrPlaceholder(url) || isMissingOrPlaceholder(key)) return null;
  return { url, key };
}

/**
 * Returns the gateway config, or throws if not configured.
 */
export function requireGatewayConfig(routeTag: string): GatewayConfig {
  const config = getPropertyDbConfigOrNull();
  if (!config) {
    throw new Error(
      `[${routeTag}] LOCAL_API_URL and LOCAL_API_KEY must be set for property DB access`,
    );
  }
  return config;
}

function hostFromUrl(rawUrl: string): string {
  try {
    return new URL(rawUrl).host;
  } catch {
    return "invalid-url";
  }
}

export function logPropertyDbRuntimeHealth(routeTag: string): GatewayConfig | null {
  const config = getPropertyDbConfigOrNull();
  const key = `${routeTag}:${config ? "ok" : "invalid"}`;
  if (loggedHealthChecks.has(key)) {
    return config;
  }
  loggedHealthChecks.add(key);

  if (!config) {
    console.warn(
      `[property-db-health] route=${routeTag} status=invalid reason=missing_or_placeholder_env`,
    );
    return null;
  }

  console.info(
    `[property-db-health] route=${routeTag} status=ok host=${hostFromUrl(config.url)} key_present=true`,
  );
  return config;
}
