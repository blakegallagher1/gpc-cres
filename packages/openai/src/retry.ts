function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withJitter(valueMs: number, jitterFraction: number): number {
  const jitter = valueMs * jitterFraction;
  const min = Math.max(0, valueMs - jitter);
  const max = valueMs + jitter;
  return Math.floor(min + Math.random() * (max - min));
}

export type RetryOptions = {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffCoefficient: number;
  jitterFraction: number;
};

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 6,
  initialDelayMs: 500,
  maxDelayMs: 120_000,
  backoffCoefficient: 2,
  jitterFraction: 0.2,
};

function shouldRetryError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;

  const anyErr = err as {
    status?: number;
    code?: string | number;
    message?: string;
  };

  const status = typeof anyErr.status === "number" ? anyErr.status : undefined;
  if (!status) return false;

  // Retry only transient classes: 429 and 5xx.
  if (status === 429) return true;
  if (status >= 500 && status <= 599) return true;

  return false;
}

export async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  options?: Partial<RetryOptions>,
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY_OPTIONS, ...(options ?? {}) };
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    try {
      return await fn(attempt);
    } catch (err) {
      const isRetryable = shouldRetryError(err);
      if (!isRetryable || attempt >= cfg.maxAttempts) throw err;

      const backoffBase =
        cfg.initialDelayMs * Math.pow(cfg.backoffCoefficient, Math.max(0, attempt - 1));
      const delayMs = Math.min(cfg.maxDelayMs, backoffBase);
      await sleep(withJitter(delayMs, cfg.jitterFraction));
    }
  }
}

