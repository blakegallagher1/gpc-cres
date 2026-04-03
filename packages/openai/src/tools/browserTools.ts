import { tool } from "@openai/agents";
import { z } from "zod";

type CuaModelPreference = "gpt-5.4" | "gpt-5.4-mini";

const DEFAULT_CUA_WORKER_URL = "https://cua.gallagherpropco.com";
const CUA_GATEWAY_FALLBACK_URL = "https://gateway.gallagherpropco.com";
const MAX_BROWSER_TASK_SAMPLE_ROWS = 5;
const MAX_BROWSER_TASK_RETRY_INSTRUCTION_CHARS = 1_200;

type JsonRecord = Record<string, unknown>;

function isJsonLikeString(value: string): boolean {
  const trimmed = value.trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}

function parseJsonLikeString(value: string): unknown {
  if (!isJsonLikeString(value)) {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function normalizeBrowserTaskValue(value: unknown): unknown {
  if (typeof value === "string") {
    const parsed = parseJsonLikeString(value);
    if (parsed !== value) {
      return normalizeBrowserTaskValue(parsed);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeBrowserTaskValue);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, normalizeBrowserTaskValue(entry)]),
  );
}

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
  const normalized = normalizeBrowserTaskValue(value);

  if (normalized !== value) {
    return summarizeBrowserTaskValue(normalized);
  }

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

function readNumberField(record: JsonRecord | null, keys: string[]): number | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function readStringField(record: JsonRecord | null, keys: string[]): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function pickBrowserTaskRows(data: JsonRecord | null): unknown[] {
  if (!data) return [];
  const candidates = [
    data.sampleRows,
    data.sample_rows,
    data.records,
    data.listings,
    data.rows,
    data.data,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function unwrapBrowserTaskPayload(value: unknown): JsonRecord | null {
  let current: unknown = value;
  const visited = new Set<unknown>();

  while (isRecord(current) && !visited.has(current)) {
    visited.add(current);
    if (hasStructuredBrowserPayload(current)) {
      return current;
    }

    if (isRecord(current.data)) {
      current = current.data;
      continue;
    }

    if (isRecord(current.finalMessage)) {
      current = current.finalMessage;
      continue;
    }

    if (isRecord(current.result)) {
      current = current.result;
      continue;
    }

    return current;
  }

  return isRecord(current) ? current : null;
}

function hasStructuredBrowserPayload(data: JsonRecord | null): boolean {
  if (!data) return false;
  return [
    "confirmed_api",
    "api_url",
    "verified_source",
    "verified_page_url",
    "embedded_app_url",
    "total_count",
    "total_records",
    "totalRows",
    "records",
    "listings",
    "sampleRows",
    "sample_rows",
    "api_verified",
  ].some((key) => key in data);
}

function buildBrowserTaskDataContract(result: JsonRecord): JsonRecord | null {
  const rawMessageValue =
    typeof result.finalMessage === "string"
      ? parseJsonLikeString(result.finalMessage)
      : result.finalMessage;
  const rawMessageRecord = unwrapBrowserTaskPayload(rawMessageValue);
  const data = unwrapBrowserTaskPayload(result.data);
  const mergedData = data ?? rawMessageRecord;
  if (!hasStructuredBrowserPayload(mergedData)) {
    return null;
  }
  const source = isRecord(result.source) ? result.source : null;
  const totalCount = readNumberField(mergedData, [
    "totalCount",
    "total_count",
    "totalRows",
    "total_records",
    "sample_count",
    "total_accessible_east_baton_rouge_for_sale_or_salelease_listings",
  ]);
  const rows = pickBrowserTaskRows(mergedData);
  const sampleRows = rows.slice(0, MAX_BROWSER_TASK_SAMPLE_ROWS).map(summarizeBrowserTaskValue);
  const omittedRows = Math.max(
    (typeof totalCount === "number" ? totalCount : rows.length) - sampleRows.length,
    0,
  );
  const apiUrl =
    readStringField(mergedData, ["confirmed_api", "api_url"]) ??
    (isRecord(mergedData?.verified_source)
      ? readStringField(mergedData.verified_source as JsonRecord, ["api_url"])
      : undefined) ??
    readStringField(source, ["url"]);
  const pageUrl =
    readStringField(mergedData, ["verified_page_url", "page_url"]) ??
    readStringField(source, ["url"]);
  const embeddedAppUrl = readStringField(mergedData, [
    "embedded_app_url",
    "app_url",
  ]);
  const blocker = readStringField(mergedData, ["blocker"]);
  const status = readStringField(mergedData, ["status"]) ?? "ok";
  const apiVerified =
    mergedData?.api_verified === true ||
    Boolean(apiUrl && readStringField(mergedData, ["verified_page_url", "embedded_app_url"]));

  const summaryParts = ["Browser task completed."];
  if (typeof totalCount === "number") {
    summaryParts.push(`Matched ${totalCount} records.`);
  }
  if (apiUrl) {
    summaryParts.push(`Verified source: ${apiUrl}`);
  } else if (pageUrl) {
    summaryParts.push(`Verified page: ${pageUrl}`);
  }
  if (sampleRows.length > 0) {
    summaryParts.push(`Returned ${sampleRows.length} sample rows.`);
  }
  if (blocker) {
    summaryParts.push(`Blocker: ${blocker}`);
  }

  return {
    status,
    summary: summaryParts.join(" "),
    totalCount,
    sampleRows,
    omittedRows,
    apiVerified,
    blocker: blocker ?? null,
    source: {
      pageUrl,
      embeddedAppUrl,
      apiUrl,
      fetchedAt: readStringField(source, ["fetchedAt"]),
    },
  };
}

function compactBrowserTaskRetryInstructions(instructions: string): string {
  const normalized = instructions.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_BROWSER_TASK_RETRY_INSTRUCTION_CHARS) {
    return normalized;
  }

  const compactPrefix = normalized.slice(0, 950).trim();
  return [
    compactPrefix,
    "Use code-first recon and direct data/API extraction when available.",
    "Return only a compact structured result with source, total count, and up to 5 sample rows.",
  ].join(" ");
}

function sanitizeSuccessfulBrowserTaskResult(result: JsonRecord): JsonRecord {
  const normalized = normalizeBrowserTaskValue(result);
  const normalizedResult = isRecord(normalized) ? normalized : result;
  const compactData = buildBrowserTaskDataContract(normalizedResult);

  if (!compactData) {
    return {
      ...normalizedResult,
      data: summarizeBrowserTaskValue(normalizedResult.data),
      finalMessage:
        typeof normalizedResult.finalMessage === "string"
          ? normalizedResult.finalMessage
          : normalizedResult.finalMessage,
    };
  }

  return {
    ...normalizedResult,
    data: compactData,
    finalMessage: compactData.summary,
  };
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

      const instructionVariants = [instructions];
      const compactRetryInstructions = compactBrowserTaskRetryInstructions(instructions);
      if (compactRetryInstructions !== instructions) {
        instructionVariants.push(compactRetryInstructions);
      }

      for (const candidateUrl of getCuaCandidateUrls(configuredCuaUrl)) {
        for (let variantIndex = 0; variantIndex < instructionVariants.length; variantIndex += 1) {
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
              instructions: instructionVariants[variantIndex],
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
              break;
            }
            if (
              response.status === 400 &&
              /context window/i.test(text) &&
              variantIndex + 1 < instructionVariants.length
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

        if (taskId) {
          break;
        }

        if (createFailure?.status === 404 && candidateUrl === DEFAULT_CUA_WORKER_URL) {
          continue;
        }
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
        let sanitized: JsonRecord;
        try {
          sanitized = sanitizeSuccessfulBrowserTaskResult(result as JsonRecord);
        } catch {
          sanitized = result as JsonRecord;
        }
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
