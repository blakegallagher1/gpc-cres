import { logger as sharedLogger, recordDataAgentAutoFeed } from "../../../utils/logger";

/**
 * App-level structured logger adapter for `apps/web`.
 */
export const logger = sharedLogger;

export { recordDataAgentAutoFeed };

/**
 * Converts unknown thrown values into structured logging fields.
 */
export function serializeErrorForLogs(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    };
  }

  return {
    errorMessage: String(error),
  };
}
