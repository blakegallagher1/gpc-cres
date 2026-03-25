import { tool } from "@openai/agents";
import { z } from "zod";

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
  execute: async ({ url, instructions, model }) => {
    const cuaUrl = process.env.CUA_WORKER_URL ?? "https://cua.gallagherpropco.com";
    const apiKey = process.env.LOCAL_API_KEY;

    if (!apiKey) {
      return { success: false, error: "LOCAL_API_KEY not configured" };
    }

    const cuaModel = model ?? (process.env.CUA_DEFAULT_MODEL as "gpt-5.4" | "gpt-5.4-mini") ?? "gpt-5.4";

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000); // 2 min timeout

      const response = await fetch(`${cuaUrl}/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
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
        return { success: false, error: `CUA worker returned ${response.status}: ${text}` };
      }

      const { taskId, statusUrl } = await response.json() as { taskId: string; statusUrl: string };

      // Poll for completion (the task runs async on the worker)
      const result = await pollForResult(cuaUrl, taskId, apiKey);

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
  maxWaitMs = 120_000,
  intervalMs = 2_000,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));

    const res = await fetch(`${cuaUrl}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) continue;

    const task = await res.json() as { status: string; result?: Record<string, unknown> };

    if (task.status === "completed" || task.status === "failed") {
      return task.result ?? { success: false, error: "No result returned" };
    }
  }

  return { success: false, error: "Browser task timed out after 2 minutes" };
}
