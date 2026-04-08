import { logger as sharedLogger, recordDataAgentAutoFeed } from "../../../utils/logger";

export const logger = sharedLogger;

export { recordDataAgentAutoFeed };

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
