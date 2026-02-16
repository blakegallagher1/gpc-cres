export type RetryDelayOptions = {
  initialDelayMs?: number;
  maxDelayMs?: number;
  multiplier?: number;
  jitterRatio?: number;
  random?: () => number;
};

export type RetryOptions = RetryDelayOptions & {
  retries?: number;
  shouldRetry?: (error: unknown) => boolean;
  getRetryAfterMs?: (error: unknown) => number | null;
  sleep?: (ms: number) => Promise<void>;
};

const DEFAULT_RETRIES = 2;
const DEFAULT_INITIAL_DELAY_MS = 1_000;
const DEFAULT_MAX_DELAY_MS = 8_000;
const DEFAULT_MULTIPLIER = 2;
const DEFAULT_JITTER_RATIO = 0.25;

function clampNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizeRetryDelayOptions(options: RetryDelayOptions) {
  return {
    initialDelayMs:
      typeof options.initialDelayMs === "number" && options.initialDelayMs > 0
        ? options.initialDelayMs
        : DEFAULT_INITIAL_DELAY_MS,
    maxDelayMs:
      typeof options.maxDelayMs === "number" && options.maxDelayMs > 0
        ? options.maxDelayMs
        : DEFAULT_MAX_DELAY_MS,
    multiplier:
      typeof options.multiplier === "number" && options.multiplier > 0
        ? options.multiplier
        : DEFAULT_MULTIPLIER,
    jitterRatio:
      typeof options.jitterRatio === "number" && options.jitterRatio >= 0
        ? options.jitterRatio
        : DEFAULT_JITTER_RATIO,
    random: options.random ?? Math.random,
  };
}

export function computeExponentialBackoffDelayMs(
  attempt: number,
  options: RetryDelayOptions = {},
): number {
  const { initialDelayMs, maxDelayMs, multiplier, jitterRatio, random } =
    normalizeRetryDelayOptions(options);
  const safeAttempt =
    Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
  const baseDelay = Math.min(
    maxDelayMs,
    initialDelayMs * Math.pow(multiplier, safeAttempt),
  );
  const jitter = baseDelay * jitterRatio * Math.max(0, Math.min(1, random()));
  return Math.floor(baseDelay + jitter);
}

export function parseRetryAfterHeaderMs(
  headerValue: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (!headerValue || headerValue.trim().length === 0) return null;
  const value = headerValue.trim();

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.floor(seconds * 1_000);
  }

  const absoluteMs = Date.parse(value);
  if (Number.isFinite(absoluteMs)) {
    const delta = absoluteMs - nowMs;
    return delta > 0 ? Math.floor(delta) : null;
  }

  return null;
}

function getHeaderValue(
  headers: unknown,
  key: string,
): string | null {
  if (!headers) return null;
  if (typeof (headers as { get?: unknown }).get === "function") {
    const value = (headers as { get: (name: string) => string | null }).get(key);
    return typeof value === "string" ? value : null;
  }
  if (typeof headers === "object" && headers !== null) {
    const direct = (headers as Record<string, unknown>)[key];
    if (typeof direct === "string") return direct;
    const lower = (headers as Record<string, unknown>)[key.toLowerCase()];
    if (typeof lower === "string") return lower;
  }
  return null;
}

export function getRetryAfterMsFromError(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const headers = (error as { headers?: unknown }).headers;
  const retryAfterHeader = getHeaderValue(headers, "retry-after");
  return parseRetryAfterHeaderMs(retryAfterHeader);
}

export function isRetryableOpenAIError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const status = (error as { status?: unknown }).status;
  if (typeof status !== "number") {
    const name = (error as { name?: unknown }).name;
    return (
      typeof name === "string" &&
      (name.includes("APIConnection") || name.includes("Timeout"))
    );
  }
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withExponentialBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const retries =
    typeof options.retries === "number" && options.retries >= 0
      ? Math.floor(options.retries)
      : DEFAULT_RETRIES;
  const sleep = options.sleep ?? defaultSleep;
  const shouldRetry = options.shouldRetry ?? isRetryableOpenAIError;
  const getRetryAfterMs = options.getRetryAfterMs ?? getRetryAfterMsFromError;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !shouldRetry(error)) {
        throw error;
      }

      const retryAfterMs = clampNonNegative(getRetryAfterMs(error) ?? 0);
      const computedDelay = computeExponentialBackoffDelayMs(attempt, options);
      const delayMs = retryAfterMs > 0 ? retryAfterMs : computedDelay;
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Retry failed");
}
