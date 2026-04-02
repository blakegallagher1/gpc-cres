import { tool } from "@openai/agents";
import { z } from "zod";

type CuaModelPreference = "gpt-5.4" | "gpt-5.4-mini";

const DEFAULT_CUA_WORKER_URL = "https://cua.gallagherpropco.com";
const CUA_GATEWAY_FALLBACK_URL = "https://gateway.gallagherpropco.com";
const MAX_BROWSER_TASK_SAMPLE_ROWS = 5;
const MAX_BROWSER_TASK_INLINE_MESSAGE_LENGTH = 2_000;

type JsonRecord = Record<string, unknown>;

function buildBrowserTaskFailureResult(options: {
  url: string;
  cuaModel: CuaModelPreference;
  status?: number;
  detail: string;
}): Record<string, unknown> {
  const { url, cuaModel, status, detail } = options;
  const statusPrefix = typeof status === "number" ? ` (${status})` : "";
  const unavailable =
    status === 404 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /not found|unavailable|fetch failed|connection refused/i.test(detail);

  const recoveryHint = unavailable
    ? "Browser automation is currently unavailable. If the task does not require login, clicking, or form interaction, switch to Perplexity web research or local evidence instead of retrying browser_task."
    : "Browser task failed. Show the user the last screenshot and ask what to try differently.";

  return {
    success: false,
    error: `CUA worker task create failed${statusPrefix}: ${detail}`,
    modeUsed: cuaModel,
    cost: { inputTokens: 0, outputTokens: 0 },
    source: {
      url,
      fetchedAt: new Date().toISOString(),
    },
    serviceUnavailable: unavailable,
    suggestedLane: unavailable ? "public_web" : "interactive_browser",
    _hint: recoveryHint,
  };
}

function sanitizeCuaModel(value: unknown): CuaModelPreference | null {
  return value === "gpt-5.4" || value === "gpt-5.4-mini" ? value : null;
}

function getPreferredCuaModel(context: unknown): CuaModelPreference | null {
  let raw = context as Record<string, unknown> | undefined;
  if (
    raw &&
    typeof raw === "object" &&
    "context" in raw &&
    typeof raw.context === "object" &&
    raw.context !== null
  ) {
    raw = raw.context as Record<string, unknown>;
  }

  return sanitizeCuaModel(raw?.preferredCuaModel);
}

function getCuaCandidateUrls(primaryUrl: string): string[] {
  if (primaryUrl !== DEFAULT_CUA_WORKER_URL) {
    return [primaryUrl];
  }
  return [DEFAULT_CUA_WORKER_URL, CUA_GATEWAY_FALLBACK_URL];
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function summarizeLargeArray(value: unknown[]): JsonRecord {
  const sample = value.slice(0, MAX_BROWSER_TASK_SAMPLE_ROWS).map(summarizeBrowserTaskValue);
  return {
    totalRows: value.length,
    sampleRows: sample,
    omittedRows: Math.max(value.length - sample.length, 0),
    truncated: value.length > sample.length,
  };
}

function summarizeBrowserTaskValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (value.length <= MAX_BROWSER_TASK_SAMPLE_ROWS) {
      return value.map(summarizeBrowserTaskValue);
    }
    return summarizeLargeArray(value);
  }

  if (!isRecord(value)) {
    return value;
  }

  const summarized: JsonRecord = {};
  for (const [key, entry] of Object.entries(value)) {
    if (Array.isArray(entry) && key === "data" && entry.length > MAX_BROWSER_TASK_SAMPLE_ROWS) {
      summarized[key] = summarizeLargeArray(entry);
      continue;
    }

    summarized[key] = summarizeBrowserTaskValue(entry);
  }
  return summarized;
}

function buildCondensedFinalMessage(result: JsonRecord): string | null {
  const rawMessage = typeof result.finalMessage === "string" ? result.finalMessage.trim() : "";
  const data = isRecord(result.data) ? result.data : null;
  const totalRows =
    data && typeof data.totalRows === "number"
      ? data.totalRows
      : data && typeof data.total_accessible_east_baton_rouge_for_sale_or_salelease_listings === "number"
        ? data.total_accessible_east_baton_rouge_for_sale_or_salelease_listings
        : undefined;
  const sourceUrl =
    data && typeof data.confirmed_api === "string"
      ? data.confirmed_api
      : isRecord(result.source) && typeof result.source.url === "string"
        ? result.source.url
        : undefined;

  const hasLargeStructuredPayload =
    data &&
    ((typeof data.totalRows === "number" && data.totalRows > MAX_BROWSER_TASK_SAMPLE_ROWS) ||
      (Array.isArray(data.sampleRows) && typeof data.omittedRows === "number" && data.omittedRows > 0));

  const shouldCondense =
    rawMessage.length > MAX_BROWSER_TASK_INLINE_MESSAGE_LENGTH ||
    Boolean(hasLargeStructuredPayload);

  if (!shouldCondense) {
    return rawMessage || null;
  }

  if (!rawMessage && !sourceUrl && typeof totalRows !== "number") {
    return null;
  }

  const lines = ["Browser task completed."];
  if (typeof totalRows === "number") {
    lines.push(`Matched ${totalRows} records.`);
  }
  if (sourceUrl) {
    lines.push(`Verified source: ${sourceUrl}`);
  }
  const trimmedRawMessage = rawMessage.slice(0, MAX_BROWSER_TASK_INLINE_MESSAGE_LENGTH).trim();
  if (trimmedRawMessage.length > 0 && trimmedRawMessage.length <= 600) {
    lines.push(trimmedRawMessage);
  }
  return lines.join(" ");
}

function sanitizeSuccessfulBrowserTaskResult(result: JsonRecord): JsonRecord {
  const sanitized: JsonRecord = {
    ...result,
    data: summarizeBrowserTaskValue(result.data),
  };

  const condensedFinalMessage = buildCondensedFinalMessage(sanitized);
  if (condensedFinalMessage) {
    sanitized.finalMessage = condensedFinalMessage;
  }

  if (isRecord(sanitized.data)) {
    const data = sanitized.data as JsonRecord;
    const sampleRows = Array.isArray(data.sampleRows) ? data.sampleRows : undefined;
    if (sampleRows && typeof sanitized.finalMessage === "string") {
      sanitized.finalMessage += ` Sample rows returned: ${sampleRows.length}.`;
    }
  }

  return sanitized;
}

/**
 * Browser Automation Tools — CUA Worker integration.
 *
 * Uses a real browser with GPT-5.4 or GPT-5.4-mini computer use to navigate
 * websites and extract structured data from interactive pages.
 *
 * Env vars:
 *   CUA_WORKER_URL — CUA worker base URL (default: https://cua.gallagherpropco.com)
 *   LOCAL_API_KEY — Bearer token for CUA worker
 *   CUA_DEFAULT_MODEL — Default vision model (gpt-5.4 or gpt-5.4-mini)
 */

export const browser_task = tool({
  name: "browser_task",
  description:
    "Navigate to a website and perform tasks using a real browser with GPT-5.4 computer use. " +
    "Use this when you need to look up data on external websites like county assessor portals, " +
    "LACDB, FEMA maps, parish clerk sites, or any other web resource that requires interactive navigation. " +
    "Returns structured data extracted from the page plus screenshots of the browser session.",
  parameters: z.object({
    url: z.string().describe("The URL to navigate to"),
    instructions: z.string().describe(
      "Natural language instructions for what to do on the site and what data to extract. " +
      "Be very specific about what data fields you need returned."
    ),
    model: z.enum(["gpt-5.4", "gpt-5.4-mini"]).nullable()
      .describe("Vision model for browser automation. null = use user's default preference from chat header."),
    timeoutSeconds: z.number().nullable()
      .describe("Max seconds to wait for task completion. Default 300, max 600. Set lower (120) for quick recon phases, higher for complex tasks. Capped at 600."),
  }),
  execute: async ({ url, instructions, model, timeoutSeconds }, context) => {
    const configuredCuaUrl = process.env.CUA_WORKER_URL?.trim() || DEFAULT_CUA_WORKER_URL;
    const apiKey = process.env.LOCAL_API_KEY?.trim();

    if (!apiKey) {
      return { success: false, error: "LOCAL_API_KEY not configured" };
    }

    // CF Access service token headers (required when calling through Cloudflare tunnel)
    const cfHeaders: Record<string, string> = {};
    const cfClientId = process.env.CF_ACCESS_CLIENT_ID?.trim();
    const cfClientSecret = process.env.CF_ACCESS_CLIENT_SECRET?.trim();
    if (cfClientId && cfClientSecret) {
      cfHeaders["CF-Access-Client-Id"] = cfClientId;
      cfHeaders["CF-Access-Client-Secret"] = cfClientSecret;
    }

    const cuaModel =
      model ??
      getPreferredCuaModel(context) ??
      sanitizeCuaModel(process.env.CUA_DEFAULT_MODEL) ??
      "gpt-5.4";

    try {
      let activeCuaUrl = configuredCuaUrl;
      let taskId: string | null = null;
      let createFailure: { status?: number; detail: string } | null = null;

      for (const candidateUrl of getCuaCandidateUrls(configuredCuaUrl)) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120_000);

        const response = await fetch(`${candidateUrl}/tasks`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            ...cfHeaders,
          },
          body: JSON.stringify({
            url,
            instructions,
            model: cuaModel,
            mode: "auto",
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          createFailure = { status: response.status, detail: text };
          if (
            response.status === 404 &&
            candidateUrl === DEFAULT_CUA_WORKER_URL
          ) {
            continue;
          }
          return buildBrowserTaskFailureResult({
            url,
            cuaModel,
            status: response.status,
            detail: text,
          });
        }

        const body = await response.json() as { taskId: string };
        taskId = body.taskId;
        activeCuaUrl = candidateUrl;
        break;
      }

      if (!taskId) {
        return buildBrowserTaskFailureResult({
          url,
          cuaModel,
          status: createFailure?.status,
          detail: createFailure?.detail ?? "CUA worker task create returned no task id",
        });
      }

      // Poll for completion (the task runs async on the worker)
      const pollTimeout = Math.min(timeoutSeconds ?? 300, 600) * 1000;
      const result = await pollForResult(activeCuaUrl, taskId, apiKey, cfHeaders, pollTimeout);

      if (result.success) {
        const sanitized = sanitizeSuccessfulBrowserTaskResult(result as JsonRecord);
        return {
          success: true,
          data: sanitized.data,
          source: sanitized.source,
          screenshots: sanitized.screenshots,
          turns: sanitized.turns,
          cost: sanitized.cost,
          modeUsed: sanitized.modeUsed,
          finalMessage: sanitized.finalMessage,
          _hint: "Data extracted successfully. Ask the user if they want to save this to the knowledge base using store_knowledge_entry.",
        };
      } else {
        return {
          success: false,
          error: result.error ?? "Browser task failed",
          screenshots: result.screenshots,
          turns: result.turns,
          _hint: "Browser task failed. Show the user the last screenshot and ask for guidance on what to try differently.",
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return buildBrowserTaskFailureResult({
        url,
        cuaModel,
        detail: `CUA worker request failed: ${message}`,
      });
    }
  },
});

async function pollForResult(
  cuaUrl: string,
  taskId: string,
  apiKey: string,
  cfHeaders: Record<string, string> = {},
  maxWaitMs = 300_000,
  intervalMs = 2_000,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + maxWaitMs;
  let pollAttempts = 0;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    pollAttempts += 1;

    const res = await fetch(`${cuaUrl}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}`, ...cfHeaders },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        success: false,
        error: `CUA task status poll failed for ${taskId} with ${res.status}: ${text}`,
        source: {
          url: taskId,
          fetchedAt: new Date().toISOString(),
        },
        turns: 0,
        cost: { inputTokens: 0, outputTokens: 0 },
        modeUsed: "native",
        screenshots: [],
        attempts: pollAttempts,
      };
    }

    const task = await res.json() as { status: string; result?: Record<string, unknown> };

    if (task.status === "completed" || task.status === "failed") {
      return task.result ?? { success: false, error: "No result returned" };
    }
  }

  const waitSecs = Math.round(maxWaitMs / 1000);
  return { success: false, error: `Browser task timed out after ${waitSecs} seconds` };
}
