import { tool } from "@openai/agents";
import { z } from "zod";

type CuaModelPreference = "gpt-5.4" | "gpt-5.4-mini";

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
  }),
  execute: async ({ url, instructions, model }, context) => {
    const cuaUrl = process.env.CUA_WORKER_URL?.trim() || "https://cua.gallagherpropco.com";
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000); // 2 min timeout

      const response = await fetch(`${cuaUrl}/tasks`, {
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
        return {
          success: false,
          error: `CUA worker task create failed (${response.status}): ${text}`,
          modeUsed: cuaModel,
          cost: { inputTokens: 0, outputTokens: 0 },
          source: {
            url,
            fetchedAt: new Date().toISOString(),
          },
        };
      }

      const { taskId, statusUrl } = await response.json() as { taskId: string; statusUrl: string };

      // Poll for completion (the task runs async on the worker)
      const result = await pollForResult(cuaUrl, taskId, apiKey, cfHeaders);

      if (result.success) {
        return {
          success: true,
          data: result.data,
          source: result.source,
          screenshots: result.screenshots,
          turns: result.turns,
          cost: result.cost,
          modeUsed: result.modeUsed,
          finalMessage: result.finalMessage,
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
      return { success: false, error: `CUA worker request failed: ${message}` };
    }
  },
});

async function pollForResult(
  cuaUrl: string,
  taskId: string,
  apiKey: string,
  cfHeaders: Record<string, string> = {},
  maxWaitMs = 120_000,
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

  return { success: false, error: "Browser task timed out after 2 minutes" };
}
