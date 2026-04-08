import {
  autoFeedRun as autoFeedRunInPackage,
  type AutoFeedInput,
  type AutoFeedResult,
} from "@gpc/server";

import { isSchemaDriftError } from "@/lib/api/prismaSchemaFallback";
import { isLocalAppRuntime } from "@/lib/server/appDbEnv";
import { logger, recordDataAgentAutoFeed } from "./loggerAdapter";

export type { AutoFeedInput, AutoFeedResult } from "@gpc/server";

export async function autoFeedRun(input: AutoFeedInput): Promise<AutoFeedResult> {
  return autoFeedRunInPackage(input, {
    isSchemaDriftError,
    isLocalAppRuntime,
    logger,
    recordDataAgentAutoFeed,
  });
}
