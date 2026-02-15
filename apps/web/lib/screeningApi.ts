function normalizeBackendUrl(rawUrl: string): string {
  return rawUrl.trim().replace(/\/+$/, "");
}

function parseBackendUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

  if (configuredUrl) {
    return normalizeBackendUrl(configuredUrl);
  }

  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:8000";
  }

  return "";
}

function isRetryableStatus(status: number | undefined): boolean {
  if (!status) return false;
  return status >= 500 || status === 429 || status === 408;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeEndpoint(endpoint: string): string {
  return endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
}

function normalizeResponseText(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "";
  return normalized.length > 240 ? `${normalized.slice(0, 240)}...` : normalized;
}

async function describeRequestError(response: Response): Promise<string> {
  const base = `Request failed with ${response.status} ${response.statusText}`;

  try {
    const raw = await response.text();
    if (!raw.trim()) {
      return base;
    }

    try {
      const payload = JSON.parse(raw) as {
        error?: unknown;
        message?: unknown;
        detail?: unknown;
      };
      const nextMessage =
        typeof payload?.error === "string"
          ? payload.error
          : typeof payload?.message === "string"
            ? payload.message
            : typeof payload?.detail === "string"
              ? payload.detail
              : normalizeResponseText(raw);
      return `${base}: ${nextMessage}`;
    } catch {
      return `${base}: ${normalizeResponseText(raw)}`;
    }
  } catch {
    return base;
  }
}

export async function fetchScreeningJson<T>(
  endpoint: string,
  init: RequestInit = {},
  options: { retries?: number; retryDelayMs?: number } = {}
): Promise<T> {
  const retries = Math.max(1, options.retries ?? 1);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 500);
  const baseUrl = parseBackendUrl();

  if (!baseUrl) {
    throw new Error(
      "Screening backend URL is not configured. Set NEXT_PUBLIC_BACKEND_URL for production."
    );
  }

  const url = `${baseUrl}${sanitizeEndpoint(endpoint)}`;
  const initHeaders =
    init.body && typeof init.body === "string"
      ? { "Content-Type": "application/json", ...(init.headers ?? {}) }
      : init.headers;
  const requestInit = { ...init, headers: initHeaders };

  let lastError: Error = new Error("Unknown request error");

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(url, requestInit);

      if (!response.ok) {
        const message = await describeRequestError(response);
        lastError = new Error(message);
        (lastError as Error & { status?: number }).status = response.status;
        if (!isRetryableStatus(response.status) || attempt === retries - 1) {
          throw lastError;
        }
      } else {
        return (await response.json()) as T;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Request failed");
      const requestError = error as Error & { status?: number };
      const isRetryable =
        requestError?.status === undefined ||
        isRetryableStatus(requestError.status);
      if (
        attempt === retries - 1 ||
        !isRetryable
      ) {
        throw lastError;
      }
    }

    await delay((2 ** attempt) * retryDelayMs);
  }

  throw lastError;
}

export function getScreeningDealUrl(projectId: string): string {
  return `/screening/${encodeURIComponent(projectId)}`;
}
