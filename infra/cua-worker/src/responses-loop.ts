/**
 * Responses API computer_call loop
 * Simplified port from @cua-sample/runner-core/responses-loop.ts
 */

import OpenAI from "openai";
import type {
  BrowserSession,
  ComputerAction,
  ComputerCallItem,
  MessageItem,
  ResponseOutputItem,
  ResponsesApiResponse,
  TaskEvent,
  TaskResult,
} from "./types.js";

const DEFAULT_INTER_ACTION_DELAY_MS = 120;
const TOOL_EXECUTION_TIMEOUT_MS = 20_000;

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

  switch (action.type) {
    case "click": {
      await page.mouse.click(x, y, { button });
      break;
    }

    case "double_click": {
      await page.mouse.dblclick(x, y, { button });
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

      await page.mouse.move(startPoint.x, startPoint.y);
      await page.mouse.down();

      for (const point of path.slice(1)) {
        await page.mouse.move(point.x, point.y);
      }

      await page.mouse.up();
      break;
    }

    case "move": {
      await page.mouse.move(x, y);
      break;
    }

    case "scroll": {
      if (Number.isFinite(x) && Number.isFinite(y)) {
        await page.mouse.move(x, y);
      }
      await page.mouse.wheel(
        Number(action.delta_x ?? action.deltaX ?? 0),
        Number(action.delta_y ?? action.deltaY ?? action.scroll_y ?? 0),
      );
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

    // Call Responses API (GA format: input, not messages)
    let response: ResponsesApiResponse;
    try {
      response = (await client.responses.create(
        {
          model,
          instructions: systemInstructions,
          input: nextInput as any,
          tools: [{ type: "computer" } as any],
          reasoning: { effort: "medium" },
          truncation: "auto",
          context_management: [{ compact_threshold: 200_000 }],
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

    // Get computer calls from response
    const computerCalls = getComputerCallItems(response);

    // No tool calls = model is done, extract final message
    if (computerCalls.length === 0) {
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

    // Execute actions from each computer_call and send back computer_call_output
    const toolOutputs: unknown[] = [];

    for (const computerCall of computerCalls) {
      const actions = computerCall.actions ?? [];

      // Execute each action in order
      for (const action of actions) {
        try {
          await executeComputerAction(session, action, signal);
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

      // Capture screenshot AFTER executing all actions in this batch
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

      // Build computer_call_output with the new screenshot
      toolOutputs.push({
        type: "computer_call_output",
        call_id: computerCall.call_id,
        output: {
          type: "computer_screenshot",
          image_url: screenshotDataUrl,
        },
      });
    }

    // Send tool outputs as input for next turn
    nextInput = toolOutputs;
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
