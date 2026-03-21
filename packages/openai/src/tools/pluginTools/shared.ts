type JsonRecord = Record<string, unknown>;
type ProviderName = "github" | "vercel" | "cloudflare" | "neptune-flood";

type PluginErrorResponse = {
  status: "error";
  provider: ProviderName;
  error: string;
  httpStatus: number | null;
  details: JsonRecord | null;
};

type PluginSuccessResponse<T extends JsonRecord> = T & {
  status: "ok";
  provider: ProviderName;
};

type HttpResult =
  | {
    ok: true;
    status: number;
    body: unknown;
  }
  | {
    ok: false;
    status: number | null;
    error: string;
    details: JsonRecord | null;
  };

const REQUEST_TIMEOUT_MS = 15_000;
const GITHUB_API_BASE_URL = "https://api.github.com";
const VERCEL_API_BASE_URL = "https://api.vercel.com";
const CLOUDFLARE_API_BASE_URL = "https://api.cloudflare.com/client/v4";

export type { HttpResult, JsonRecord, ProviderName };

export function buildSuccessResponse<T extends JsonRecord>(
  provider: ProviderName,
  payload: T,
): string {
  const response: PluginSuccessResponse<T> = {
    status: "ok",
    provider,
    ...payload,
  };
  return JSON.stringify(response);
}

export function buildErrorResponse(
  provider: ProviderName,
  error: string,
  options?: {
    httpStatus?: number | null;
    details?: JsonRecord | null;
  },
): string {
  const response: PluginErrorResponse = {
    status: "error",
    provider,
    error,
    httpStatus: options?.httpStatus ?? null,
    details: options?.details ?? null,
  };
  return JSON.stringify(response);
}

export function getRequiredEnv(envName: string): string | null {
  const value = process.env[envName]?.trim();
  return value && value.length > 0 ? value : null;
}

export function getOptionalEnv(envName: string): string | null {
  const value = process.env[envName]?.trim();
  return value && value.length > 0 ? value : null;
}

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

export function toRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function toStringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function toNumberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function toBooleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

async function jsonRequest(options: {
  url: string;
  method?: "GET" | "POST";
  headers: Record<string, string>;
  body?: JsonRecord | null;
}): Promise<HttpResult> {
  try {
    const response = await fetch(options.url, {
      method: options.method ?? "GET",
      headers: options.headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = await parseResponseBody(response);

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `Request failed with status ${response.status}`,
        details: toRecord(body),
      };
    }

    return {
      ok: true,
      status: response.status,
      body,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : String(error),
      details: null,
    };
  }
}

export function appendQueryParam(
  searchParams: URLSearchParams,
  key: string,
  value: string | number | null,
): void {
  if (value === null) {
    return;
  }
  searchParams.set(key, String(value));
}

export function buildMissingEnvResponse(
  provider: ProviderName,
  envName: string,
): string {
  return buildErrorResponse(provider, `${envName} is not set`, {
    details: { missingEnv: envName },
  });
}

export function buildNeptuneBaseUrlError(): string {
  return buildErrorResponse(
    "neptune-flood",
    "NEPTUNE_FLOOD_BASE_URL is not set",
    {
      details: {
        missingEnv: "NEPTUNE_FLOOD_BASE_URL",
        note:
          "Set the Neptune-issued API Express base URL to enable live flood plugin calls.",
      },
    },
  );
}

function buildGithubHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
  };
}

function buildVercelHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
}

function buildCloudflareHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function buildNeptuneHeaders(apiKey: string): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "x-api-key": apiKey,
  };
}

function buildGithubRepoUrl(owner: string, repo: string, path: string): string {
  return `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}${path}`;
}

export async function githubRequest(
  token: string,
  owner: string,
  repo: string,
  path: string,
  options?: {
    method?: "GET" | "POST";
    body?: JsonRecord | null;
    query?: URLSearchParams | null;
  },
): Promise<HttpResult> {
  const url = new URL(buildGithubRepoUrl(owner, repo, path));
  if (options?.query) {
    url.search = options.query.toString();
  }

  return jsonRequest({
    url: url.toString(),
    method: options?.method,
    headers: {
      ...buildGithubHeaders(token),
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options?.body ?? null,
  });
}

export async function vercelRequest(
  token: string,
  path: string,
  query?: URLSearchParams | null,
): Promise<HttpResult> {
  const url = new URL(`${VERCEL_API_BASE_URL}${path}`);
  if (query) {
    url.search = query.toString();
  }

  return jsonRequest({
    url: url.toString(),
    headers: buildVercelHeaders(token),
  });
}

export async function cloudflareRequest(
  token: string,
  path: string,
  options?: {
    method?: "GET" | "POST";
    body?: JsonRecord | null;
    query?: URLSearchParams | null;
  },
): Promise<HttpResult> {
  const url = new URL(`${CLOUDFLARE_API_BASE_URL}${path}`);
  if (options?.query) {
    url.search = options.query.toString();
  }

  const result = await jsonRequest({
    url: url.toString(),
    method: options?.method,
    headers: buildCloudflareHeaders(token),
    body: options?.body ?? null,
  });

  if (!result.ok) {
    return result;
  }

  const payload = toRecord(result.body);
  if (!payload) {
    return {
      ok: false,
      status: result.status,
      error: "Cloudflare response was not a JSON object",
      details: null,
    };
  }

  const success = toBooleanValue(payload.success);
  if (success === false) {
    const errors = Array.isArray(payload.errors) ? payload.errors : [];
    const message = errors
      .map((entry) => {
        const record = toRecord(entry);
        return toStringValue(record?.message) ?? JSON.stringify(entry);
      })
      .join("; ");

    return {
      ok: false,
      status: result.status,
      error: message || "Cloudflare request failed",
      details: payload,
    };
  }

  return {
    ok: true,
    status: result.status,
    body: payload.result ?? null,
  };
}

export async function neptuneRequest(
  apiKey: string,
  path: string,
  body: JsonRecord,
): Promise<HttpResult> {
  const baseUrl = getOptionalEnv("NEPTUNE_FLOOD_BASE_URL");
  if (!baseUrl) {
    return {
      ok: false,
      status: null,
      error: "NEPTUNE_FLOOD_BASE_URL is not set",
      details: {
        missingEnv: "NEPTUNE_FLOOD_BASE_URL",
      },
    };
  }

  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  return jsonRequest({
    url: url.toString(),
    method: "POST",
    headers: buildNeptuneHeaders(apiKey),
    body,
  });
}
