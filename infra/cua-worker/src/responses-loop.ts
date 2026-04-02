/**
 * Responses API computer_call loop
 * Simplified port from @cua-sample/runner-core/responses-loop.ts
 */

import OpenAI from "openai";
import type {
  BrowserSession,
  ComputerAction,
  ComputerCallItem,
  FunctionCallItem,
  MessageItem,
  ResponseOutputItem,
  ResponsesApiResponse,
  TaskEvent,
  TaskResult,
} from "./types.js";

const DEFAULT_INTER_ACTION_DELAY_MS = 120;
const TOOL_EXECUTION_TIMEOUT_MS = 20_000;
const MAX_PROGRESS_MEMO_CHARS = 1_200;

type LoopProgressState = {
  lastUrl: string | null;
  consecutiveSameUrlTurns: number;
  consecutiveExecErrors: number;
  stalledTurns: number;
};

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractTerminalDataLaneResult(execSummaries: string[]): {
  finalMessage: string;
  data: Record<string, unknown>;
  sourceUrl: string | null;
} | null {
  for (let index = execSummaries.length - 1; index >= 0; index -= 1) {
    const summary = execSummaries[index];
    const parsed = parseJsonLikeString(summary);
    if (!isRecord(parsed)) {
      continue;
    }

    const sourceUrl =
      typeof parsed.confirmed_api === "string"
        ? parsed.confirmed_api
        : isRecord(parsed.verified_source) &&
            typeof parsed.verified_source.api_url === "string"
          ? parsed.verified_source.api_url
          : null;

    const totalRecords =
      typeof parsed.total_records === "number"
        ? parsed.total_records
        : typeof parsed.totalRows === "number"
          ? parsed.totalRows
          : null;

    const lines = ["Verified direct data lane discovered."];
    if (sourceUrl) {
      lines.push(`Source: ${sourceUrl}`);
    }
    if (typeof totalRecords === "number") {
      lines.push(`Total records: ${totalRecords}`);
    }

    return {
      finalMessage: lines.join(" "),
      data: parsed,
      sourceUrl,
    };
  }

  return null;
}

function detectDirectDataLane(execSummaries: string[]): boolean {
  if (execSummaries.length === 0) return false;
  const joined = execSummaries.join("\n");
  return /public_api|backing_search_results|api\/[a-z0-9/_-]+|dataset|embedded_app_url|listing(s)? endpoint|verified data lane/i.test(
    joined,
  );
}

function truncateProgressText(text: string, maxChars = MAX_PROGRESS_MEMO_CHARS): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars - 1)}…`;
}

function buildLoopProgressMemo(options: {
  turn: number;
  currentUrl: string;
  computerActionCount: number;
  execSummaries: string[];
  execErrors: string[];
  progressState: LoopProgressState;
  directDataLaneDetected: boolean;
}): string {
  const {
    turn,
    currentUrl,
    computerActionCount,
    execSummaries,
    execErrors,
    progressState,
    directDataLaneDetected,
  } = options;

  const memoLines = [
    `Runtime progress after turn ${turn}:`,
    `- Current URL: ${currentUrl || "(blank)"}`,
    `- Computer actions executed: ${computerActionCount}`,
  ];

  if (execSummaries.length > 0) {
    memoLines.push(`- Latest exec_js signals: ${truncateProgressText(execSummaries.join(" | "))}`);
  }

  if (execErrors.length > 0) {
    memoLines.push(`- Latest exec_js errors: ${truncateProgressText(execErrors.join(" | "))}`);
  }

  if (directDataLaneDetected) {
    memoLines.push(
      "- High-value signal: a likely direct data lane or backing endpoint was discovered.",
    );
    memoLines.push(
      "- If that source already answers the user query, stop browser exploration now and return the structured result.",
    );
  }

  if (progressState.consecutiveSameUrlTurns >= 2) {
    memoLines.push(
      `- Stall signal: page URL has not changed for ${progressState.consecutiveSameUrlTurns} turns.`,
    );
  }

  if (progressState.consecutiveExecErrors >= 2) {
    memoLines.push(
      `- Stall signal: exec_js has failed in ${progressState.consecutiveExecErrors} consecutive turns.`,
    );
  }

  if (progressState.stalledTurns > 0) {
    memoLines.push("- Required reflection: explicitly assess whether the last turn made progress.");
    memoLines.push("- If progress was weak, change strategy instead of repeating the same selectors/actions.");
    memoLines.push("- Prefer DOM inspection, URL inspection, and short code probes before more UI clicking.");
  } else {
    memoLines.push("- Required reflection: confirm what you learned and choose the single best next step.");
  }

  memoLines.push("- Stop and explain the blocker if the task is gated by login, CAPTCHA, consent, or a browser safety barrier.");
  return memoLines.join("\n");
}

function getActionModifierKeys(action: ComputerAction): string[] {
  return Array.isArray(action.keys)
    ? action.keys
        .map((key) => normalizePlaywrightKey(String(key)))
        .filter(Boolean)
    : [];
}

async function runWithHeldKeys(
  session: BrowserSession,
  keys: string[],
  callback: () => Promise<void>,
): Promise<void> {
  if (keys.length === 0) {
    await callback();
    return;
  }

  for (const key of keys) {
    await session.page.keyboard.down(key);
  }

  try {
    await callback();
  } finally {
    for (const key of [...keys].reverse()) {
      await session.page.keyboard.up(key);
    }
  }
}

function formatPendingSafetyChecks(computerCall: ComputerCallItem): string | null {
  const checks = computerCall.pending_safety_checks ?? [];
  if (checks.length === 0) return null;

  const summary = checks
    .map((check) => {
      const code = check.code?.trim();
      const message = check.message?.trim();
      return [code, message].filter(Boolean).join(": ");
    })
    .filter(Boolean)
    .join(" | ");

  return summary.length > 0
    ? `Computer use paused for human confirmation: ${summary}`
    : "Computer use paused for human confirmation.";
}

/**
 * Normalize key names for Playwright keyboard input
 */
function normalizePlaywrightKey(key: string): string {
  const normalized = key.trim();
  const lookup = normalized.toUpperCase();

  switch (lookup) {
    case "CTRL":
    case "CONTROL":
      return "Control";
    case "CMD":
    case "COMMAND":
    case "META":
      return "Meta";
    case "ALT":
    case "OPTION":
      return "Alt";
    case "SHIFT":
      return "Shift";
    case "ENTER":
    case "RETURN":
      return "Enter";
    case "ESC":
    case "ESCAPE":
      return "Escape";
    case "SPACE":
      return "Space";
    case "TAB":
      return "Tab";
    case "BACKSPACE":
      return "Backspace";
    case "DELETE":
      return "Delete";
    case "HOME":
      return "Home";
    case "END":
      return "End";
    case "PGUP":
    case "PAGEUP":
      return "PageUp";
    case "PGDN":
    case "PAGEDOWN":
      return "PageDown";
    case "UP":
    case "ARROWUP":
      return "ArrowUp";
    case "DOWN":
    case "ARROWDOWN":
      return "ArrowDown";
    case "LEFT":
    case "ARROWLEFT":
      return "ArrowLeft";
    case "RIGHT":
    case "ARROWRIGHT":
      return "ArrowRight";
    default:
      return normalized.length === 1
        ? normalized
        : normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
  }
}

/**
 * Capture screenshot as base64 data URL
 */
async function capturePageImageDataUrl(session: BrowserSession): Promise<string> {
  const payload = await session.page.screenshot({ type: "png" });
  return `data:image/png;base64,${payload.toString("base64")}`;
}

// =============================================================================
// exec_js Code-Execution Harness (Option 3)
// =============================================================================

type ExecContext = {
  page: import("playwright").Page;
  _collectedOutput: string[];
  _capturedScreenshot: string | null;
  output: (text: string) => void;
  screenshot: () => Promise<string>;
  vars: Record<string, unknown>;
};

function createExecContext(session: BrowserSession): ExecContext {
  const ctx: ExecContext = {
    page: session.page,
    _collectedOutput: [],
    _capturedScreenshot: null,
    output(text: string) {
      ctx._collectedOutput.push(String(text));
    },
    async screenshot() {
      ctx._capturedScreenshot = await capturePageImageDataUrl(session);
      return "[screenshot captured]";
    },
    vars: {},
  };
  return ctx;
}

async function executeExecJs(
  ctx: ExecContext,
  code: string,
  signal: AbortSignal,
): Promise<{ text: string; screenshotDataUrl: string | null }> {
  ctx._collectedOutput = [];
  ctx._capturedScreenshot = null;

  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const fn = new AsyncFunction("page", "output", "screenshot", "vars", code);

  const result = await Promise.race([
    fn(ctx.page, ctx.output.bind(ctx), ctx.screenshot.bind(ctx), ctx.vars),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`exec_js timed out after ${TOOL_EXECUTION_TIMEOUT_MS}ms`)), TOOL_EXECUTION_TIMEOUT_MS),
    ),
    new Promise((_, reject) => {
      if (signal.aborted) reject(new Error("Run aborted."));
      signal.addEventListener("abort", () => reject(new Error("Run aborted.")), { once: true });
    }),
  ]);

  if (ctx._collectedOutput.length === 0 && result !== undefined) {
    ctx._collectedOutput.push(typeof result === "string" ? result : JSON.stringify(result));
  }

  return {
    text: ctx._collectedOutput.join("\n") || "(no output)",
    screenshotDataUrl: ctx._capturedScreenshot,
  };
}

const EXEC_JS_TOOL = {
  type: "function" as const,
  name: "exec_js",
  description:
    "Execute JavaScript in the browser with full Playwright page API access. " +
    "The `page` object (Playwright Page) is pre-bound. " +
    "Call `output(text)` to return text results to you. " +
    "Call `screenshot()` to capture and return the current page screenshot. " +
    "Use for DOM queries, data extraction, form filling, or any task " +
    "where code is faster than visual interaction. " +
    "Variables persist in `vars` across calls within this task.",
  parameters: {
    type: "object" as const,
    properties: {
      code: {
        type: "string" as const,
        description:
          "JavaScript code to execute. Has access to: " +
          "`page` (Playwright Page), `output(text)` (return text), " +
          "`screenshot()` (capture page), `vars` (persistent storage).",
      },
    },
    required: ["code"],
    additionalProperties: false,
  },
  strict: true,
};

/**
 * Delay with abort signal support
 */
async function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return;
  }

  if (signal.aborted) {
    throw new Error("Run aborted.");
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(new Error("Run aborted."));
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Execute a single computer action on the page
 */
async function executeComputerAction(
  session: BrowserSession,
  action: ComputerAction,
  signal: AbortSignal,
): Promise<void> {
  const { page } = session;
  const buttonValue = action.button;
  const button =
    buttonValue === "right" || buttonValue === 2 || buttonValue === 3
      ? "right"
      : buttonValue === "middle" || buttonValue === "wheel"
        ? "middle"
        : "left";
  const x = Number(action.x ?? 0);
  const y = Number(action.y ?? 0);
  const modifierKeys = getActionModifierKeys(action);

  switch (action.type) {
    case "click": {
      await runWithHeldKeys(session, modifierKeys, async () => {
        await page.mouse.click(x, y, { button });
      });
      break;
    }

    case "double_click": {
      await runWithHeldKeys(session, modifierKeys, async () => {
        await page.mouse.dblclick(x, y, { button });
      });
      break;
    }

    case "drag": {
      const path = Array.isArray(action.path)
        ? action.path
            .map((point) =>
              point &&
              typeof point === "object" &&
              "x" in point &&
              "y" in point
                ? {
                    x: Number((point as { x: unknown }).x),
                    y: Number((point as { y: unknown }).y),
                  }
                : null,
            )
            .filter(
              (point): point is { x: number; y: number } => point !== null,
            )
        : [];

      if (path.length < 2) {
        throw new Error("drag action did not include a valid path.");
      }

      const startPoint = path[0];
      if (!startPoint) {
        throw new Error("drag action did not include a valid start point.");
      }

      await runWithHeldKeys(session, modifierKeys, async () => {
        await page.mouse.move(startPoint.x, startPoint.y);
        await page.mouse.down();

        for (const point of path.slice(1)) {
          await page.mouse.move(point.x, point.y);
        }

        await page.mouse.up();
      });
      break;
    }

    case "move": {
      await runWithHeldKeys(session, modifierKeys, async () => {
        await page.mouse.move(x, y);
      });
      break;
    }

    case "scroll": {
      await runWithHeldKeys(session, modifierKeys, async () => {
        if (Number.isFinite(x) && Number.isFinite(y)) {
          await page.mouse.move(x, y);
        }
        await page.mouse.wheel(
          Number(action.delta_x ?? action.deltaX ?? 0),
          Number(action.delta_y ?? action.deltaY ?? action.scroll_y ?? 0),
        );
      });
      break;
    }

    case "type": {
      const text = String(action.text ?? "");
      await page.keyboard.type(text);
      break;
    }

    case "keypress": {
      const keys = Array.isArray(action.keys)
        ? action.keys
            .map((key) => normalizePlaywrightKey(String(key)))
            .filter(Boolean)
        : [normalizePlaywrightKey(String(action.key ?? ""))].filter(Boolean);

      if (keys.length === 0) {
        throw new Error("keypress action did not include a key value.");
      }

      await page.keyboard.press(keys.join("+"));
      break;
    }

    case "wait": {
      const durationMs = Number(action.ms ?? action.duration_ms ?? 1_000);
      await delay(Math.max(0, durationMs), signal);
      break;
    }

    case "screenshot": {
      // No-op: screenshot is taken after actions
      break;
    }

    default: {
      throw new Error(`Unsupported computer action: ${action.type}`);
    }
  }

  // Inter-action delay
  if (action.type !== "wait" && action.type !== "screenshot") {
    await delay(DEFAULT_INTER_ACTION_DELAY_MS, signal);
  }
}

/**
 * Extract assistant message text from response
 */
function extractAssistantMessageText(response: ResponsesApiResponse): string {
  return (response.output ?? [])
    .filter((item): item is MessageItem => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text?.trim())
    .filter((text): text is string => Boolean(text))
    .join("\n\n");
}

/**
 * Get computer call items from response
 */
function getComputerCallItems(response: ResponsesApiResponse): ComputerCallItem[] {
  return (response.output ?? []).filter(
    (item): item is ComputerCallItem => item.type === "computer_call",
  );
}

function getFunctionCallItems(response: ResponsesApiResponse): FunctionCallItem[] {
  return (response.output ?? []).filter(
    (item): item is FunctionCallItem => item.type === "function_call",
  );
}

/**
 * Ensure response succeeded
 */
function ensureResponseSucceeded(response: ResponsesApiResponse): void {
  if (response.error?.message) {
    throw new Error(response.error.message);
  }

  if (response.status === "failed") {
    throw new Error("Responses API request failed.");
  }
}

/**
 * Run the native computer_call loop using Responses API
 *
 * This is the main loop that:
 * 1. Captures screenshot as base64
 * 2. Sends to OpenAI with computer tool enabled
 * 3. Executes returned actions on the page
 * 4. Chains turns with previous_response_id
 * 5. Continues until model returns a message or maxTurns reached
 */
export async function runNativeComputerLoop(options: {
  client: OpenAI;
  model: string;
  session: BrowserSession;
  instructions: string;
  playbook?: {
    strategy?: string;
    codeSnippet?: string;
    selectors?: Record<string, string>;
  };
  maxTurns: number;
  onEvent: (event: TaskEvent) => void;
  signal: AbortSignal;
}): Promise<TaskResult> {
  const {
    client,
    model,
    session,
    instructions,
    maxTurns,
    onEvent,
    signal,
  } = options;

  let turn = 0;
  let previousResponseId: string | undefined;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCachedTokens = 0;
  const screenshotPaths: string[] = [];
  let finalMessage = "";
  const progressState: LoopProgressState = {
    lastUrl: session.page.url(),
    consecutiveSameUrlTurns: 0,
    consecutiveExecErrors: 0,
    stalledTurns: 0,
  };

  // Persistent execution context for exec_js calls
  const execContext = createExecContext(session);

  // Capture initial screenshot
  const initialScreenshot = await capturePageImageDataUrl(session);
  const initialCapture = await session.captureScreenshot("initial-state");
  screenshotPaths.push(initialCapture.path);

  onEvent({
    type: "status",
    turn: 0,
    timestamp: new Date().toISOString(),
    action: "Initial screenshot captured",
  });

  // Build system instructions with optional playbook strategy
  const systemInstructions = options.playbook?.strategy
    ? `${instructions}\n\nStrategy from previous successful runs:\n${options.playbook.strategy}`
    : instructions;

  // First turn input: user message with text + screenshot
  let nextInput: unknown = [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: instructions,
        },
        {
          type: "input_image",
          image_url: initialScreenshot,
          detail: "original",
        },
      ],
    },
  ];

  // Main loop
  while (turn < maxTurns) {
    if (signal.aborted) {
      throw new Error("Run aborted.");
    }

    turn += 1;
    const reasoningEffort =
      progressState.stalledTurns > 0 || progressState.consecutiveExecErrors > 0
        ? "medium"
        : "low";

    // Call Responses API (GA format: input, not messages)
    let response: ResponsesApiResponse;
    try {
      response = (await client.responses.create(
        {
          model,
          instructions: systemInstructions,
          input: nextInput as any,
          tools: [{ type: "computer" } as any, EXEC_JS_TOOL as any],
          reasoning: { effort: reasoningEffort },
          context_management: [{ type: "compaction", compact_threshold: 200_000 }],
          prompt_cache_key: "entitlement-os-cua-v1",
          prompt_cache_retention: "24h",
          ...(previousResponseId
            ? { previous_response_id: previousResponseId }
            : {}),
        } as any,
        { signal },
      )) as ResponsesApiResponse;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      onEvent({
        type: "error",
        turn,
        timestamp: new Date().toISOString(),
        data: { error: errorMsg },
      });
      throw error;
    }

    ensureResponseSucceeded(response);
    previousResponseId = response.id;

    // Track tokens
    if (response.usage) {
      totalInputTokens += response.usage.input_tokens ?? 0;
      totalOutputTokens += response.usage.output_tokens ?? 0;
      const cachedTokens = (response.usage as any)?.prompt_tokens_details?.cached_tokens ?? 0;
      totalCachedTokens += cachedTokens;
    }

    // Get tool calls from response (both computer_call and function_call)
    const computerCalls = getComputerCallItems(response);
    const functionCalls = getFunctionCallItems(response);

    // No tool calls = model is done, extract final message
    if (computerCalls.length === 0 && functionCalls.length === 0) {
      finalMessage = extractAssistantMessageText(response);
      if (finalMessage) {
        onEvent({
          type: "status",
          turn,
          timestamp: new Date().toISOString(),
          action: "Final message received from model",
          data: { message: finalMessage },
        });
      }
      break;
    }

    const toolOutputs: unknown[] = [];
    const execSummaries: string[] = [];
    const execErrors: string[] = [];
    let computerActionCount = 0;
    let turnHadSuccessfulExec = false;

    // Handle computer_call items (visual interaction)
    for (const computerCall of computerCalls) {
      const pendingSafetyMessage = formatPendingSafetyChecks(computerCall);
      if (pendingSafetyMessage) {
        onEvent({
          type: "error",
          turn,
          timestamp: new Date().toISOString(),
          data: {
            error: pendingSafetyMessage,
            pendingSafetyChecks: computerCall.pending_safety_checks,
          },
        });
        throw new Error(pendingSafetyMessage);
      }

      const actions = computerCall.actions ?? [];

      for (const action of actions) {
        try {
          await executeComputerAction(session, action, signal);
          computerActionCount += 1;
          onEvent({
            type: "action",
            turn,
            timestamp: new Date().toISOString(),
            action: action.type,
          });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          onEvent({
            type: "error",
            turn,
            timestamp: new Date().toISOString(),
            data: { error: errorMsg, action: action.type },
          });
          throw error;
        }
      }

      const screenshotDataUrl = await capturePageImageDataUrl(session);
      const screenshotArtifact = await session.captureScreenshot(`turn-${turn}`);
      screenshotPaths.push(screenshotArtifact.path);

      onEvent({
        type: "screenshot",
        turn,
        timestamp: new Date().toISOString(),
        screenshotUrl: screenshotArtifact.path,
        action: `Executed ${actions.length} action(s)`,
      });

      toolOutputs.push({
        type: "computer_call_output",
        call_id: computerCall.call_id,
        output: {
          type: "computer_screenshot",
          image_url: screenshotDataUrl,
        },
      });
    }

    // Handle function_call items (exec_js code execution)
    for (const fnCall of functionCalls) {
      if (fnCall.name !== "exec_js") {
        // Unknown function — return error
        toolOutputs.push({
          type: "function_call_output",
          call_id: fnCall.call_id,
          output: `Error: unknown function "${fnCall.name}"`,
        });
        continue;
      }

      let code: string;
      try {
        const args = JSON.parse(fnCall.arguments ?? "{}");
        code = args.code ?? "";
      } catch {
        toolOutputs.push({
          type: "function_call_output",
          call_id: fnCall.call_id,
          output: "Error: invalid JSON in function arguments",
        });
        continue;
      }

      onEvent({
        type: "action",
        turn,
        timestamp: new Date().toISOString(),
        action: "exec_js",
      });

      try {
        const result = await executeExecJs(execContext, code, signal);
        turnHadSuccessfulExec = true;
        execSummaries.push(result.text);

        // Save screenshot artifact if one was captured
        if (result.screenshotDataUrl) {
          const artifact = await session.captureScreenshot(`exec-${turn}`);
          screenshotPaths.push(artifact.path);
        }

        // Build output: text-only or text+image array
        const output = result.screenshotDataUrl
          ? [
              { type: "input_text", text: result.text },
              {
                type: "input_image",
                image_url: result.screenshotDataUrl,
                detail: "original",
              },
            ]
          : result.text;

        toolOutputs.push({
          type: "function_call_output",
          call_id: fnCall.call_id,
          output,
        });

        onEvent({
          type: "status",
          turn,
          timestamp: new Date().toISOString(),
          action: "exec_js completed",
          data: { outputLength: result.text.length, hasScreenshot: !!result.screenshotDataUrl },
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        execErrors.push(errorMsg);
        toolOutputs.push({
          type: "function_call_output",
          call_id: fnCall.call_id,
          output: `Error: ${errorMsg}`,
        });

        onEvent({
          type: "error",
          turn,
          timestamp: new Date().toISOString(),
          data: { error: errorMsg, action: "exec_js" },
        });
        // Don't throw — let the model see the error and recover
      }
    }

    const currentUrl = session.page.url();
    const directDataLaneDetected = detectDirectDataLane(execSummaries);
    progressState.consecutiveSameUrlTurns =
      currentUrl === progressState.lastUrl
        ? progressState.consecutiveSameUrlTurns + 1
        : 0;
    progressState.lastUrl = currentUrl;
    progressState.consecutiveExecErrors = execErrors.length > 0
      ? progressState.consecutiveExecErrors + 1
      : 0;
    progressState.stalledTurns =
      progressState.consecutiveSameUrlTurns >= 2 &&
      !turnHadSuccessfulExec &&
      (computerActionCount > 0 || execErrors.length > 0)
        ? progressState.stalledTurns + 1
        : 0;

    const progressMemo = buildLoopProgressMemo({
      turn,
      currentUrl,
      computerActionCount,
      execSummaries,
      execErrors,
      progressState,
      directDataLaneDetected,
    });

    const terminalDataLaneResult =
      directDataLaneDetected && computerCalls.length === 0 && turnHadSuccessfulExec
        ? extractTerminalDataLaneResult(execSummaries)
        : null;

    if (functionCalls.length > 0 && computerCalls.length === 0) {
      const postExecScreenshot = await session.captureScreenshot(`turn-${turn}-post-exec`);
      screenshotPaths.push(postExecScreenshot.path);
      onEvent({
        type: "screenshot",
        turn,
        timestamp: new Date().toISOString(),
        screenshotUrl: postExecScreenshot.path,
        action: "Captured post-exec browser state",
      });
    }

    if (terminalDataLaneResult) {
      finalMessage = terminalDataLaneResult.finalMessage;
      onEvent({
        type: "status",
        turn,
        timestamp: new Date().toISOString(),
        action: "Verified data lane satisfied the task; stopping browser loop",
        data: {
          sourceUrl: terminalDataLaneResult.sourceUrl ?? undefined,
        },
      });

      onEvent({
        type: "complete",
        turn,
        timestamp: new Date().toISOString(),
        data: {
          turns: turn,
          totalInputTokens,
          totalOutputTokens,
          totalCachedTokens,
        },
      });

      return {
        success: true,
        data: terminalDataLaneResult.data,
        screenshots: screenshotPaths,
        turns: turn,
        modeUsed: "native",
        cost: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          cachedTokens: totalCachedTokens,
        },
        source: {
          url: terminalDataLaneResult.sourceUrl ?? session.page.url(),
          fetchedAt: new Date().toISOString(),
        },
        finalMessage,
      };
    }

    // Send all tool outputs as input for next turn
    nextInput = [
      ...toolOutputs,
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: progressMemo,
          },
        ],
      },
    ];
  }

  onEvent({
    type: "complete",
    turn,
    timestamp: new Date().toISOString(),
    data: {
      turns: turn,
      totalInputTokens,
      totalOutputTokens,
      totalCachedTokens,
    },
  });

  return {
    success: true,
    data: { finalMessage },
    screenshots: screenshotPaths,
    turns: turn,
    modeUsed: "native",
    cost: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      cachedTokens: totalCachedTokens,
    },
    source: {
      url: session.page.url(),
      fetchedAt: new Date().toISOString(),
    },
    finalMessage,
  };
}

/**
 * Run code mode: execute a JavaScript snippet via page.evaluate()
 * Falls back to native mode on error
 */
export async function runCodeMode(options: {
  client: OpenAI;
  model: string;
  session: BrowserSession;
  instructions: string;
  codeSnippet: string;
  onEvent: (event: TaskEvent) => void;
  signal: AbortSignal;
}): Promise<TaskResult> {
  const { session, codeSnippet, onEvent, signal } = options;

  if (signal.aborted) {
    throw new Error("Run aborted.");
  }

  try {
    // Capture initial screenshot
    const initialScreenshot = await capturePageImageDataUrl(session);
    const initialCapture = await session.captureScreenshot("initial-state");
    const screenshotPaths: string[] = [initialCapture.path];

    onEvent({
      type: "status",
      turn: 0,
      timestamp: new Date().toISOString(),
      action: "Code mode: executing snippet",
    });

    // Execute the code snippet
    const result = await session.page.evaluate((code: string) => {
      return (0, eval)(code);
    }, codeSnippet);

    // Capture result screenshot
    const resultScreenshot = await session.captureScreenshot("code-result");
    screenshotPaths.push(resultScreenshot.path);

    onEvent({
      type: "screenshot",
      turn: 1,
      timestamp: new Date().toISOString(),
      screenshotUrl: resultScreenshot.path,
      action: "Code executed successfully",
    });

    onEvent({
      type: "complete",
      turn: 1,
      timestamp: new Date().toISOString(),
      data: { result },
    });

    return {
      success: true,
      data: result,
      screenshots: screenshotPaths,
      turns: 1,
      modeUsed: "code",
      cost: {
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
      },
      source: {
        url: session.page.url(),
        fetchedAt: new Date().toISOString(),
      },
      finalMessage: typeof result === "string" ? result : JSON.stringify(result),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    onEvent({
      type: "error",
      turn: 0,
      timestamp: new Date().toISOString(),
      data: { error: errorMsg },
    });

    // In code mode, we don't fall back — just return the error
    return {
      success: false,
      error: errorMsg,
      data: null,
      screenshots: [],
      turns: 0,
      modeUsed: "code",
      cost: {
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
      },
      source: {
        url: session.page.url(),
        fetchedAt: new Date().toISOString(),
      },
    };
  }
}
