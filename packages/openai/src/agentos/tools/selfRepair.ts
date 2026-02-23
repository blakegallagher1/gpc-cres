import OpenAI from "openai";

import { getAgentOsConfig, isAgentOsFeatureEnabled } from "../config.js";
import { withExponentialBackoff } from "../../utils/retry.js";

type ErrorCategory =
  | "transient"
  | "input_error"
  | "permission_error"
  | "schema_mismatch"
  | "unknown";

export type RepairResult = {
  repaired: boolean;
  result: unknown;
  category: ErrorCategory;
  attempts: number;
};

type RepairLog = {
  ts: string;
  toolName: string;
  category: ErrorCategory;
  attempt: number;
  success: boolean;
  error?: string;
};

const repairLogs: RepairLog[] = [];
const MAX_REPAIR_LOGS = 500;

function logRepair(entry: RepairLog): void {
  if (repairLogs.length >= MAX_REPAIR_LOGS) repairLogs.shift();
  repairLogs.push(entry);
}

export function getRepairLogs(): readonly RepairLog[] {
  return repairLogs;
}

function classifyError(error: Error): ErrorCategory {
  const msg = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  if (
    msg.includes("timeout") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("rate limit") ||
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("502") ||
    msg.includes("504") ||
    name.includes("timeout") ||
    name.includes("apiconnection")
  ) {
    return "transient";
  }

  if (
    msg.includes("validation") ||
    msg.includes("invalid") ||
    msg.includes("required") ||
    msg.includes("must be") ||
    msg.includes("expected") ||
    msg.includes("parse")
  ) {
    return "input_error";
  }

  if (
    msg.includes("permission") ||
    msg.includes("forbidden") ||
    msg.includes("unauthorized") ||
    msg.includes("401") ||
    msg.includes("403") ||
    msg.includes("access denied")
  ) {
    return "permission_error";
  }

  if (
    msg.includes("schema") ||
    msg.includes("unexpected") ||
    msg.includes("format") ||
    msg.includes("cannot read propert")
  ) {
    return "schema_mismatch";
  }

  return "unknown";
}

const MAX_REPAIR_PER_TOOL = 3;
const MAX_REPAIR_PER_RUN = 6;
const MAX_INPUT_REVISION_ATTEMPTS = 2;

export class SelfRepairExecutor {
  private toolAttempts = new Map<string, number>();
  private totalAttempts = 0;

  resetCounters(): void {
    this.toolAttempts.clear();
    this.totalAttempts = 0;
  }

  async handleFailure(
    toolName: string,
    input: unknown,
    error: Error,
    executeFn: (input: unknown) => Promise<unknown>,
  ): Promise<RepairResult> {
    if (!isAgentOsFeatureEnabled("selfRepair")) {
      return { repaired: false, result: null, category: "unknown", attempts: 0 };
    }

    const toolCount = this.toolAttempts.get(toolName) ?? 0;
    if (toolCount >= MAX_REPAIR_PER_TOOL || this.totalAttempts >= MAX_REPAIR_PER_RUN) {
      return { repaired: false, result: null, category: classifyError(error), attempts: toolCount };
    }

    const category = classifyError(error);

    switch (category) {
      case "transient":
        return this.retryTransient(toolName, executeFn, input, category);

      case "input_error":
        return this.retryWithRevision(toolName, input, error, executeFn, category);

      case "permission_error":
        this.bump(toolName);
        logRepair({ ts: new Date().toISOString(), toolName, category, attempt: toolCount + 1, success: false, error: error.message });
        return { repaired: false, result: null, category, attempts: toolCount + 1 };

      case "schema_mismatch":
        return this.retryTransient(toolName, executeFn, input, category);

      default:
        this.bump(toolName);
        logRepair({ ts: new Date().toISOString(), toolName, category, attempt: toolCount + 1, success: false, error: error.message });
        return { repaired: false, result: null, category, attempts: toolCount + 1 };
    }
  }

  private bump(toolName: string): void {
    this.toolAttempts.set(toolName, (this.toolAttempts.get(toolName) ?? 0) + 1);
    this.totalAttempts++;
  }

  private async retryTransient(
    toolName: string,
    executeFn: (input: unknown) => Promise<unknown>,
    input: unknown,
    category: ErrorCategory,
  ): Promise<RepairResult> {
    const maxRetries = Math.min(
      3,
      MAX_REPAIR_PER_TOOL - (this.toolAttempts.get(toolName) ?? 0),
      MAX_REPAIR_PER_RUN - this.totalAttempts,
    );

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.bump(toolName);
      try {
        const result = await withExponentialBackoff(() => executeFn(input), {
          retries: 0,
        });
        logRepair({ ts: new Date().toISOString(), toolName, category, attempt, success: true });
        return { repaired: true, result, category, attempts: attempt };
      } catch (retryErr) {
        logRepair({
          ts: new Date().toISOString(),
          toolName,
          category,
          attempt,
          success: false,
          error: retryErr instanceof Error ? retryErr.message : String(retryErr),
        });
        const delay = 1000 * Math.pow(2, attempt - 1) + Math.random() * 500;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    return { repaired: false, result: null, category, attempts: this.toolAttempts.get(toolName) ?? 0 };
  }

  private async retryWithRevision(
    toolName: string,
    originalInput: unknown,
    error: Error,
    executeFn: (input: unknown) => Promise<unknown>,
    category: ErrorCategory,
  ): Promise<RepairResult> {
    const maxRevisions = Math.min(
      MAX_INPUT_REVISION_ATTEMPTS,
      MAX_REPAIR_PER_TOOL - (this.toolAttempts.get(toolName) ?? 0),
      MAX_REPAIR_PER_RUN - this.totalAttempts,
    );

    for (let attempt = 1; attempt <= maxRevisions; attempt++) {
      this.bump(toolName);
      try {
        const revisedInput = await this.generateRevisedInput(toolName, originalInput, error);
        const result = await executeFn(revisedInput);
        logRepair({ ts: new Date().toISOString(), toolName, category, attempt, success: true });
        return { repaired: true, result, category, attempts: attempt };
      } catch (retryErr) {
        logRepair({
          ts: new Date().toISOString(),
          toolName,
          category,
          attempt,
          success: false,
          error: retryErr instanceof Error ? retryErr.message : String(retryErr),
        });
      }
    }

    return { repaired: false, result: null, category, attempts: this.toolAttempts.get(toolName) ?? 0 };
  }

  private async generateRevisedInput(
    toolName: string,
    originalInput: unknown,
    error: Error,
  ): Promise<unknown> {
    const config = getAgentOsConfig();
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return originalInput;

    const client = new OpenAI({ apiKey });

    const prompt = [
      `Tool "${toolName}" failed with error: ${error.message}`,
      `Original input: ${JSON.stringify(originalInput, null, 2).slice(0, 2000)}`,
      `Suggest corrected input as valid JSON. Only output the corrected JSON, nothing else.`,
    ].join("\n");

    try {
      const response = (await client.responses.create({
        model: config.models.agent,
        input: [{ role: "user", content: prompt }],
        reasoning: { effort: "low" as "low" | "medium" | "high" },
      })) as OpenAI.Responses.Response;

      const text = response.output
        ?.filter((item): item is OpenAI.Responses.ResponseOutputMessage => item.type === "message")
        .flatMap((msg) => msg.content)
        .filter((c): c is OpenAI.Responses.ResponseOutputText => c.type === "output_text")
        .map((c) => c.text)
        .join("") ?? "";

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as unknown;
      }
    } catch {
      /* revision generation failed — return original */
    }

    return originalInput;
  }
}
