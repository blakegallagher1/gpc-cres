type RetryConfig = {
  maxRetries: number;
  backoffMs: number;
  maxBackoffMs: number;
  retryablePatterns: string[];
};

type FallbackConfig<TArgs extends unknown[], TResult> = {
  fallbackExecute?: (...args: TArgs) => Promise<TResult>;
  inferFromContext?: (...args: TArgs) => Promise<TResult>;
};

type FailureMode = "ASK_USER" | "RETURN_PARTIAL" | "SKIP_WITH_NOTE";

export type ResilientToolConfig<TArgs extends unknown[], TResult> = {
  name: string;
  execute: (...args: TArgs) => Promise<TResult>;
  retry: RetryConfig;
  fallback?: FallbackConfig<TArgs, TResult>;
  onFailure: FailureMode;
};

export type ResilientToolResult<TResult> = {
  success: boolean;
  data?: TResult;
  error?: Error;
  fallbackUsed: boolean;
  warnings: string[];
};

function isRetryableError(error: unknown, patterns: string[]): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return patterns.some((pattern) => message.includes(pattern.toLowerCase()));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ResilientToolExecutor {
  async execute<TArgs extends unknown[], TResult>(
    config: ResilientToolConfig<TArgs, TResult>,
    ...args: TArgs
  ): Promise<ResilientToolResult<TResult>> {
    const warnings: string[] = [];

    try {
      const data = await this.executeWithRetry(config, ...args);
      return {
        success: true,
        data,
        fallbackUsed: false,
        warnings,
      };
    } catch (primaryError) {
      warnings.push(
        `Primary ${config.name} execution failed: ${
          primaryError instanceof Error ? primaryError.message : String(primaryError)
        }`,
      );
    }

    if (config.fallback?.fallbackExecute) {
      try {
        const data = await config.fallback.fallbackExecute(...args);
        warnings.push("Fallback source used.");
        return {
          success: true,
          data,
          fallbackUsed: true,
          warnings,
        };
      } catch (fallbackError) {
        warnings.push(
          `Fallback failed: ${
            fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          }`,
        );
      }
    }

    if (config.fallback?.inferFromContext) {
      try {
        const data = await config.fallback.inferFromContext(...args);
        warnings.push("Result inferred from available context.");
        return {
          success: true,
          data,
          fallbackUsed: true,
          warnings,
        };
      } catch (inferenceError) {
        warnings.push(
          `Inference failed: ${
            inferenceError instanceof Error ? inferenceError.message : String(inferenceError)
          }`,
        );
      }
    }

    const finalError = new Error(
      `Resilient execution failed for ${config.name}: ${warnings.join(" | ")}`,
    );

    if (config.onFailure === "RETURN_PARTIAL") {
      return {
        success: false,
        error: finalError,
        fallbackUsed: true,
        warnings,
      };
    }

    if (config.onFailure === "SKIP_WITH_NOTE") {
      return {
        success: false,
        error: finalError,
        fallbackUsed: true,
        warnings: [...warnings, "Skipped with note due to failure policy."],
      };
    }

    throw finalError;
  }

  private async executeWithRetry<TArgs extends unknown[], TResult>(
    config: ResilientToolConfig<TArgs, TResult>,
    ...args: TArgs
  ): Promise<TResult> {
    let attempt = 0;
    let delayMs = config.retry.backoffMs;

    while (attempt <= config.retry.maxRetries) {
      try {
        return await config.execute(...args);
      } catch (error) {
        attempt += 1;
        const retryable = isRetryableError(error, config.retry.retryablePatterns);
        if (!retryable || attempt > config.retry.maxRetries) {
          throw error;
        }
        const jitter = Math.floor(Math.random() * 200);
        await sleep(delayMs + jitter);
        delayMs = Math.min(delayMs * 2, config.retry.maxBackoffMs);
      }
    }

    throw new Error(`Retry budget exhausted for ${config.name}`);
  }
}

export const resilientExecutor = new ResilientToolExecutor();
