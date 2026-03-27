/**
 * Domain-scoped credential injection for tools that interact with external services.
 * Secrets are NEVER passed to the model — they're injected at tool execute-time.
 *
 * The model sees placeholder references like "use the gateway API key" but never
 * the actual credential values. This utility maps domain URLs to environment
 * variable names and returns properly formatted auth headers.
 */

const DOMAIN_SECRETS: Record<
  string,
  { envVar: string; headerName: string; format: string }
> = {
  "api.gallagherpropco.com": {
    envVar: "LOCAL_API_KEY",
    headerName: "Authorization",
    format: "Bearer {value}",
  },
  "gateway.gallagherpropco.com": {
    envVar: "GATEWAY_PROXY_TOKEN",
    headerName: "Authorization",
    format: "Bearer {value}",
  },
  "cua.gallagherpropco.com": {
    envVar: "LOCAL_API_KEY",
    headerName: "Authorization",
    format: "Bearer {value}",
  },
  "qdrant.gallagherpropco.com": {
    envVar: "QDRANT_API_KEY",
    headerName: "api-key",
    format: "{value}",
  },
};

/**
 * Get auth headers for a given URL based on its domain.
 * Returns empty object if no secret is configured for the domain.
 */
export function getSecretHeadersForDomain(
  url: string
): Record<string, string> {
  try {
    const hostname = new URL(url).hostname;
    const config = DOMAIN_SECRETS[hostname];
    if (!config) return {};
    const value = process.env[config.envVar];
    if (!value) return {};
    return { [config.headerName]: config.format.replace("{value}", value) };
  } catch {
    return {};
  }
}

/**
 * Check if a domain has secrets configured (without revealing the value).
 */
export function hasDomainSecret(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return hostname in DOMAIN_SECRETS;
  } catch {
    return false;
  }
}
