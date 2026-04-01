# CUA Code-Execution Harness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an `exec_js` function tool alongside the existing `computer` tool in the CUA worker, so GPT-5.4 can write and execute Playwright scripts for fast DOM-based data extraction.

**Architecture:** The Responses API loop sends both `{ type: "computer" }` and a custom `exec_js` function tool. The model chooses per-turn: visual clicks via `computer_call`, or Playwright code via `function_call`. A persistent execution context exposes `page`, `output()`, `screenshot()`, and `vars` across turns.

**Tech Stack:** TypeScript, OpenAI Responses API, Playwright, Fastify (existing CUA worker)

---

### Task 1: Add `getFunctionCallItems` helper

**Files:**
- Modify: `infra/cua-worker/src/responses-loop.ts:324-328`

**Step 1: Add the helper function**

Add this function directly after `getComputerCallItems` (after line 328):

```typescript
/**
 * Get function call items from response
 */
function getFunctionCallItems(response: ResponsesApiResponse): FunctionCallItem[] {
  return (response.output ?? []).filter(
    (item): item is FunctionCallItem => item.type === "function_call",
  );
}
```

**Step 2: Update the import**

At line 8, add `FunctionCallItem` to the import from `./types.js`:

```typescript
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
```

**Step 3: Verify typecheck**

Run: `cd infra/cua-worker && npx tsc --noEmit`
Expected: Clean — no errors

**Step 4: Commit**

```bash
git add infra/cua-worker/src/responses-loop.ts
git commit -m "feat(cua): add getFunctionCallItems helper"
```

---

### Task 2: Create execution context factory

**Files:**
- Modify: `infra/cua-worker/src/responses-loop.ts` (add after `capturePageImageDataUrl` at ~line 139)

**Step 1: Add the `ExecContext` type and factory**

Insert after line 139 (`capturePageImageDataUrl` closing brace):

```typescript
/**
 * Persistent execution context for exec_js tool calls.
 * Created once per task, shared across all exec_js invocations.
 * Exposes: page (Playwright), output(), screenshot(), vars.
 */
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
```

**Step 2: Verify typecheck**

Run: `cd infra/cua-worker && npx tsc --noEmit`
Expected: Clean

**Step 3: Commit**

```bash
git add infra/cua-worker/src/responses-loop.ts
git commit -m "feat(cua): add ExecContext factory for exec_js runtime"
```

---

### Task 3: Add `executeExecJs` function

**Files:**
- Modify: `infra/cua-worker/src/responses-loop.ts` (add after `createExecContext`)

**Step 1: Add the execution function**

```typescript
/**
 * Execute a JavaScript code string in the exec_js sandbox.
 * The code has access to: page, output(), screenshot(), vars.
 * Returns: { text: string, screenshotDataUrl: string | null }
 */
async function executeExecJs(
  ctx: ExecContext,
  code: string,
  signal: AbortSignal,
): Promise<{ text: string; screenshotDataUrl: string | null }> {
  // Reset per-call state
  ctx._collectedOutput = [];
  ctx._capturedScreenshot = null;

  // Build async function with bound helpers
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const fn = new AsyncFunction(
    "page",
    "output",
    "screenshot",
    "vars",
    code,
  );

  // Execute with timeout
  const timeout = TOOL_EXECUTION_TIMEOUT_MS;
  const result = await Promise.race([
    fn(ctx.page, ctx.output.bind(ctx), ctx.screenshot.bind(ctx), ctx.vars),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`exec_js timed out after ${timeout}ms`)), timeout),
    ),
    new Promise((_, reject) => {
      if (signal.aborted) reject(new Error("Run aborted."));
      signal.addEventListener("abort", () => reject(new Error("Run aborted.")), { once: true });
    }),
  ]);

  // If the function returned a value and nothing was output(), include it
  if (ctx._collectedOutput.length === 0 && result !== undefined) {
    ctx._collectedOutput.push(
      typeof result === "string" ? result : JSON.stringify(result),
    );
  }

  return {
    text: ctx._collectedOutput.join("\n") || "(no output)",
    screenshotDataUrl: ctx._capturedScreenshot,
  };
}
```

**Step 2: Verify typecheck**

Run: `cd infra/cua-worker && npx tsc --noEmit`
Expected: Clean

**Step 3: Commit**

```bash
git add infra/cua-worker/src/responses-loop.ts
git commit -m "feat(cua): add executeExecJs sandbox with timeout"
```

---

### Task 4: Define the `exec_js` tool for the Responses API

**Files:**
- Modify: `infra/cua-worker/src/responses-loop.ts` (add constant before `runNativeComputerLoop`)

**Step 1: Add the tool definition constant**

Insert before the `runNativeComputerLoop` function (before line ~353):

```typescript
/**
 * exec_js function tool definition for Responses API.
 * Sent alongside { type: "computer" } to enable hybrid mode.
 */
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
          "`page` (Playwright Page), " +
          "`output(text)` (return text to model), " +
          "`screenshot()` (capture and return page screenshot), " +
          "`vars` (persistent object for storing data across calls).",
      },
    },
    required: ["code"],
    additionalProperties: false,
  },
  strict: true,
};
```

**Step 2: Verify typecheck**

Run: `cd infra/cua-worker && npx tsc --noEmit`
Expected: Clean

**Step 3: Commit**

```bash
git add infra/cua-worker/src/responses-loop.ts
git commit -m "feat(cua): define exec_js tool for Responses API"
```

---

### Task 5: Wire hybrid tools into the Responses API call

**Files:**
- Modify: `infra/cua-worker/src/responses-loop.ts:431-446` (the `client.responses.create` call)

**Step 1: Change the tools array**

Replace line 436:
```typescript
          tools: [{ type: "computer" } as any],
```

With:
```typescript
          tools: [{ type: "computer" } as any, EXEC_JS_TOOL as any],
```

**Step 2: Create exec context at the start of `runNativeComputerLoop`**

After line 382 (`const screenshotPaths: string[] = [];`), add:

```typescript
  // Persistent execution context for exec_js calls
  const execContext = createExecContext(session);
```

**Step 3: Verify typecheck**

Run: `cd infra/cua-worker && npx tsc --noEmit`
Expected: Clean

**Step 4: Commit**

```bash
git add infra/cua-worker/src/responses-loop.ts
git commit -m "feat(cua): send both computer + exec_js tools to Responses API"
```

---

### Task 6: Handle `function_call` items in the main loop

This is the core change. The main loop (lines 469-554) currently only processes `computer_call` items. We need to also process `function_call` items for `exec_js`.

**Files:**
- Modify: `infra/cua-worker/src/responses-loop.ts:469-554`

**Step 1: Replace the tool-processing block**

Replace the section from line 469 (`// Get computer calls from response`) through line 554 (`nextInput = toolOutputs;`) with:

```typescript
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

        // Save screenshot artifact if one was captured
        if (result.screenshotDataUrl) {
          const artifact = await session.captureScreenshot(`exec-${turn}`);
          screenshotPaths.push(artifact.path);
        }

        // Build output: text-only or text+image array
        const output = result.screenshotDataUrl
          ? [
              { type: "text", text: result.text },
              {
                type: "image_url",
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

    // Send all tool outputs as input for next turn
    nextInput = toolOutputs;
```

**Step 2: Verify typecheck**

Run: `cd infra/cua-worker && npx tsc --noEmit`
Expected: Clean

**Step 3: Commit**

```bash
git add infra/cua-worker/src/responses-loop.ts
git commit -m "feat(cua): handle exec_js function_call in main loop

The model can now mix computer_call (visual) and function_call/exec_js
(code) within the same task. Errors in exec_js are returned to the
model for self-correction, not thrown."
```

---

### Task 7: Build, deploy to Windows server, and verify

**Files:**
- No file changes — build and deploy only

**Step 1: Build the CUA worker**

Run:
```bash
cd infra/cua-worker && npm run build
```
Expected: Clean build, `dist/` updated

**Step 2: Deploy to Windows server**

```bash
scp -r infra/cua-worker/dist/ bg:'C:\gpc-cres-backend\infra\cua-worker\dist\'
ssh bg "docker restart gpc-cua-worker"
```

Wait 10 seconds, then verify health:
```bash
curl -s https://cua.gallagherpropco.com/cua/health
```
Expected: `{"status":"ok","browser":"ready"}`

**Step 3: Integration test — hybrid mode**

```bash
curl -s -X POST https://cua.gallagherpropco.com/tasks \
  -H "Authorization: Bearer $LOCAL_API_KEY" \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "instructions": "Use exec_js to extract the page title and all link hrefs as JSON. Call output() with the result.",
    "model": "gpt-5.4-mini",
    "mode": "native",
    "maxTurns": 5
  }'
```

Poll the returned taskId. Expected result:
- `success: true`
- `data.finalMessage` contains JSON with page title and links
- Task completes in 2-3 turns (screenshot → exec_js → done)

**Step 4: LACDB integration test**

In the chat UI, send:
> go to lacdb.com and gather all properties listed for sale in east baton rouge, la

Expected behavior:
- Agent uses visual navigation for LACDB search/filter setup
- Agent switches to exec_js for table data extraction
- Extraction completes in ~1 turn per page (DOM query) instead of ~20 turns (screenshots)
- Total task: < 10 turns, < 100K tokens

**Step 5: Commit deploy notes**

```bash
git add -A && git commit -m "chore(cua): deploy code-execution harness to production"
```

---

## Summary

| Task | What | Files | Est. |
|------|------|-------|------|
| 1 | `getFunctionCallItems` helper | responses-loop.ts | 2 min |
| 2 | `ExecContext` factory | responses-loop.ts | 3 min |
| 3 | `executeExecJs` sandbox | responses-loop.ts | 5 min |
| 4 | `EXEC_JS_TOOL` constant | responses-loop.ts | 2 min |
| 5 | Wire hybrid tools into API call | responses-loop.ts | 2 min |
| 6 | Handle `function_call` in main loop | responses-loop.ts | 10 min |
| 7 | Build, deploy, verify | deploy only | 10 min |

**Total: ~35 min, 1 file modified (`responses-loop.ts`), 0 new files**
