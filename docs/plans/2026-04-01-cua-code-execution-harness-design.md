# CUA Code-Execution Harness (Option 3) — Design Document

**Date:** 2026-04-01
**Status:** Approved
**Author:** Blake Gallagher + Claude
**Depends on:** `docs/plans/2026-04-01-cua-self-teaching-design.md` (autonomous multi-phase loop)

## Context

The CUA browser agent uses OpenAI's Option 1 (built-in `computer` tool with screenshot → action loop). For data extraction from large tables (e.g., LACDB's 851-row results), this is extremely slow and token-heavy — the vision model takes 24 turns of screenshots (~18 min, ~437K tokens) and only extracts 7 of 60 visible rows.

OpenAI's docs explicitly recommend **Option 3 (code-execution harness)** for this use case:

> `gpt-5.4` is trained explicitly to use this path flexibly across visual interaction and programmatic interaction with the UI, including browser APIs and DOM-based workflows. This is often a better fit when a workflow needs loops, conditional logic, DOM inspection, or richer browser libraries. Can improve speed, token efficiency, and flexibility on longer workflows.

GPT-5.4 achieves 95% success rate on first attempt and 100% within 3 attempts on property portals, and completes sessions ~3x faster while using ~70% fewer tokens with code-execution harnesses.

**Goal:** Add a hybrid mode where the model has both the `computer` tool (visual interaction) and an `exec_js` function tool (Playwright code execution) available simultaneously. The model chooses the right tool per-turn: visual for navigation, code for extraction.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tool type for code execution | `function` (not `custom`) | Structured `code` parameter, strict mode compatible |
| Hybrid vs. code-only | Hybrid — both `computer` + `exec_js` | Model chooses visual or code per-turn, like a human developer |
| Runtime persistence | Page object persists across turns within a task | Model can stash variables, reference across turns |
| Output format | Text string, or array of text + image when `screenshot()` called | Matches OpenAI docs for function outputs with images |
| Where changes live | CUA worker only (`infra/cua-worker/`) | Agent layer and browserTools.ts unchanged |

---

## Architecture

### Tool Configuration

The Responses API receives two tools:

```typescript
tools: [
  { type: "computer" },                              // visual: screenshots → clicks
  {
    type: "function",
    name: "exec_js",
    description: "Execute JavaScript in the browser with full Playwright page API access. " +
      "The `page` object (Playwright Page) is pre-bound. " +
      "Call `output(text)` to return text results to you. " +
      "Call `screenshot()` to capture and return the current page screenshot. " +
      "Use for DOM queries, data extraction, form filling, navigation, or any task " +
      "where code is faster than visual interaction. " +
      "Variables persist across calls within this task.",
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "JavaScript code to execute. Has access to: " +
            "`page` (Playwright Page), " +
            "`output(text)` (return text to model), " +
            "`screenshot()` (capture and return page screenshot)."
        }
      },
      required: ["code"],
      additionalProperties: false
    },
    strict: true
  }
]
```

### exec_js Execution Runtime

When the model returns a `function_call` for `exec_js`:

1. Parse the `code` from `arguments`
2. Create a sandboxed execution context with bound helpers:
   - `page` — the live Playwright Page object (same session as `computer` tool)
   - `output(text)` — collects text output to return to the model
   - `screenshot()` — captures page screenshot as base64 data URL
3. Execute the code via `AsyncFunction` constructor (not `eval`) for async/await support
4. Return collected output as `function_call_output`:
   - Text only: `{ type: "function_call_output", call_id, output: collectedText }`
   - Text + screenshot: `{ type: "function_call_output", call_id, output: [{ type: "text", text: collectedText }, { type: "image_url", image_url: dataUrl, detail: "original" }] }`

### Execution Context (persistent across turns within a task)

```typescript
// Created once per task, shared across all exec_js calls
const execContext = {
  page: session.page,                    // Playwright Page
  _output: [] as string[],              // collected output() calls
  _screenshot: null as string | null,   // last screenshot() result
  output(text: string) { this._output.push(String(text)); },
  async screenshot() {
    this._screenshot = await capturePageImageDataUrl(session);
    return "[screenshot captured]";
  },
  // Persistent variable storage across turns
  vars: {} as Record<string, unknown>,
};
```

The `vars` object lets the model stash data across exec_js calls within the same task:
```javascript
// Turn 5: extract data
const rows = await page.$$eval('tr', r => r.map(...));
vars.allRows = rows;
output(JSON.stringify(rows.slice(0, 5)));  // preview first 5

// Turn 6: paginate and append
await page.click('.next-page');
const moreRows = await page.$$eval('tr', r => r.map(...));
vars.allRows.push(...moreRows);
output(`Total: ${vars.allRows.length} rows`);
```

### Response Loop Changes

The main loop in `responses-loop.ts` currently handles `computer_call` items. Add handling for `function_call` items:

```
For each response output item:
  if item.type === "computer_call":
    → existing logic (execute actions, capture screenshot, return computer_call_output)
  if item.type === "function_call" && item.name === "exec_js":
    → parse code from arguments
    → execute in sandbox with page, output(), screenshot()
    → return function_call_output (text, or text+image array)
```

Both tool types can appear in the same response. Process them in order.

### Example Flow: LACDB Table Extraction

```
Turn 1: computer_call → screenshot (model sees LACDB homepage)
Turn 2: computer_call → click "Search Listings"
Turn 3: computer_call → click "Filters", toggle Sale, type "East Baton Rouge", click Update
Turn 4: computer_call → click "Data" tab (model sees 809 results, 60 per page)
Turn 5: function_call exec_js →
    const rows = await page.$$eval('.data-view table tbody tr', rows =>
      rows.map(row => {
        const cells = [...row.querySelectorAll('td')];
        return {
          address: cells[0]?.textContent?.trim(),
          name: cells[1]?.textContent?.trim(),
          type: cells[2]?.textContent?.trim(),
          status: cells[3]?.textContent?.trim(),
          primaryUse: cells[4]?.textContent?.trim(),
          company: cells[5]?.textContent?.trim(),
        };
      })
    );
    vars.allRows = rows;
    output(JSON.stringify({ count: rows.length, rows }));
Turn 6: function_call exec_js →
    await page.click('.pagination-next');
    await page.waitForLoadState('networkidle');
    const rows = await page.$$eval('.data-view table tbody tr', ...same...);
    vars.allRows.push(...rows);
    output(`Page 2 done. Total: ${vars.allRows.length}`);
    screenshot();
Turn 7-8: (repeat pagination)
Turn 9: model returns final message with all extracted data

Total: ~9 turns instead of 24. ~60K tokens instead of 437K.
```

---

## Security

- Code runs inside the CUA worker Docker container (isolated)
- `page` is scoped to the browser session created for this task
- No access to `process`, `require`, `fs`, or network outside the browser
- The `AsyncFunction` constructor runs in the same V8 isolate as the worker but with only the bound helpers exposed
- The existing `TOOL_EXECUTION_TIMEOUT_MS` (20s) applies to each exec_js call

---

## Files Changed

| File | Change | Nature |
|------|--------|--------|
| `infra/cua-worker/src/responses-loop.ts` | Add `exec_js` to tools array, add `function_call` handling in main loop, create execution context | ~80 lines added |
| `infra/cua-worker/src/types.ts` | Add `FunctionCallItem` type alongside existing `ComputerCallItem` | ~10 lines |
| `infra/cua-worker/src/server.ts` | No changes — mode dispatch stays the same, native loop gains hybrid capability | None |

### What does NOT change:
- `packages/openai/src/tools/browserTools.ts` — no changes
- `packages/openai/src/agents/entitlement-os.ts` — no prompt changes (the model discovers exec_js from the tool definition)
- CUA worker HTTP API — same POST /tasks, GET /tasks/:id interface
- Docker build — no new dependencies (Playwright already available)

---

## Verification Plan

### 1. Unit: exec_js execution
- Call exec_js with `output("hello")` → returns `"hello"`
- Call exec_js with `screenshot()` → returns array with text + image
- Call exec_js with `await page.title()` → returns page title
- Call exec_js with syntax error → returns error message, doesn't crash task

### 2. Integration: LACDB extraction
- Send task: navigate to LACDB, search East Baton Rouge sale listings, extract all visible results
- Expect: model uses computer tool for navigation, switches to exec_js for table extraction
- Expect: < 10 turns, < 100K tokens (vs. 24 turns, 437K tokens with computer-only)

### 3. Integration: hybrid mode
- Send task requiring both visual interaction and DOM extraction
- Expect: model seamlessly mixes computer_call and function_call in the same task

### 4. Regression
- Existing native-only tasks still work (exec_js is additive, not replacing computer tool)
- Existing code-mode playbooks still work via runCodeMode()
- Task creation API unchanged — no client changes needed

---

## References

- [Computer use | OpenAI API — Option 3](https://developers.openai.com/api/docs/guides/tools-computer-use#option-3-use-a-code-execution-harness)
- [Function calling | OpenAI API](https://developers.openai.com/api/docs/guides/function-calling)
- [OpenAI CUA Sample App](https://github.com/openai/openai-cua-sample-app)
- [Introducing GPT-5.4](https://openai.com/index/introducing-gpt-5-4/)
