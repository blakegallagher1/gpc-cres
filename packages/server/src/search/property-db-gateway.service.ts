import { logger } from "../logger";

export type PropertyDbGatewayScope =
  | "parcels.read"
  | "map.read"
  | "map.tiles.read"
  | "places.read";

export interface GatewayConfig {
  url: string;
  key: string;
}

export const PROPERTY_DB_INTERNAL_SCOPE_HEADER = "x-gpc-internal-scope";

const loggedHealthChecks = new Set<string>();

export class PropertyDbGatewayError extends Error {
  status: number;
  code: "GATEWAY_UNCONFIGURED" | "GATEWAY_UNAVAILABLE";

  constructor(
    message: string,
    code: "GATEWAY_UNCONFIGURED" | "GATEWAY_UNAVAILABLE",
    status: number = 503,
  ) {
    super(message);
    this.name = "PropertyDbGatewayError";
    this.status = status;
    this.code = code;
  }
}

const DEFAULT_GATEWAY_TIMEOUT_MS = 8_000;

function getGatewayTimeoutMs(override?: number): number {
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return Math.floor(override);
  }
  const raw = Number(process.env.PROPERTY_DB_GATEWAY_TIMEOUT_MS ?? "");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_GATEWAY_TIMEOUT_MS;
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

export function getCloudflareAccessHeadersFromEnv(): Record<string, string> {
  const clientId = process.env.CF_ACCESS_CLIENT_ID?.trim();
  const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return {};
  if (isMissingOrPlaceholder(clientId) || isMissingOrPlaceholder(clientSecret)) return {};
  return {
    "CF-Access-Client-Id": clientId,
    "CF-Access-Client-Secret": clientSecret,
  };
}

export function getPropertyDbConfigOrNull(): { url: string; key: string } | null {
  const url = process.env.LOCAL_API_URL?.trim();
  const key = process.env.LOCAL_API_KEY?.trim();
  if (!url || !key) return null;
  if (isMissingOrPlaceholder(url) || isMissingOrPlaceholder(key)) return null;
  return { url, key };
}

export function requireGatewayConfig(routeTag: string): GatewayConfig {
  const config = getPropertyDbConfigOrNull();
  if (!config) {
    throw new PropertyDbGatewayError(
      `[${routeTag}] LOCAL_API_URL and LOCAL_API_KEY must be set for property DB access`,
      "GATEWAY_UNCONFIGURED",
    );
  }
  return config;
}

export function getPropertyDbScopeHeaders(
  scope: PropertyDbGatewayScope,
): Record<string, string> {
  return { [PROPERTY_DB_INTERNAL_SCOPE_HEADER]: scope };
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
    logger.warn("Property DB runtime health invalid", {
      routeTag,
      reason: "missing_or_placeholder_env",
    });
    return null;
  }

  logger.info("Property DB runtime health ok", {
    routeTag,
    host: hostFromUrl(config.url),
    keyPresent: true,
  });
  return config;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs?: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getGatewayTimeoutMs(timeoutMs));
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestPropertyDbGateway(options: {
  routeTag: string;
  path: string;
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: BodyInit;
  cache?: RequestCache;
  requestId?: string;
  includeApiKey?: boolean;
  internalScope?: PropertyDbGatewayScope;
  timeoutMs?: number;
  maxRetries?: number;
}): Promise<Response> {
  const config = getPropertyDbConfigOrNull();
  if (!config) {
    throw new PropertyDbGatewayError(
      `[${options.routeTag}] LOCAL_API_URL and LOCAL_API_KEY must be set for property DB access`,
      "GATEWAY_UNCONFIGURED",
    );
  }

  const url = `${config.url.replace(/\/$/, "")}${options.path}`;
  const maxAttempts = Math.max(1, (options.maxRetries ?? 1) + 1);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetchWithTimeout(
        url,
        {
          method: options.method ?? "GET",
          headers: {
            Authorization: `Bearer ${config.key}`,
            ...(options.includeApiKey ? { apikey: config.key } : {}),
            ...(options.requestId ? { "x-request-id": options.requestId } : {}),
            ...(options.internalScope
              ? getPropertyDbScopeHeaders(options.internalScope)
              : {}),
            ...getCloudflareAccessHeadersFromEnv(),
            ...(options.headers ?? {}),
          },
          ...(options.body ? { body: options.body } : {}),
          cache: options.cache ?? "no-store",
        },
        options.timeoutMs,
      );
    } catch (error) {
      lastError = error;
      const isAbort = error instanceof Error && error.name === "AbortError";
      if (!isAbort || attempt >= maxAttempts) break;
    }
  }

  throw new PropertyDbGatewayError(
    `[${options.routeTag}] property DB gateway request failed: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
    "GATEWAY_UNAVAILABLE",
  );
}
