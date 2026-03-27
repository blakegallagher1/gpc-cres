# API Usage Audit — 2026-03-27

## Screenshot Detail Level (Pattern 47)

### Findings

**CUA Worker (infra/cua-worker/src/):**
- `types.ts` (line 140): Type definition confirms `detail: "original"` on image input
  ```typescript
  | {
      detail: "original";
      image_url: string;
      type: "input_image";
    };
  ```
- `responses-loop.ts` (line 354): Screenshot passed to Responses API with `detail: "original"`
  ```typescript
  {
    type: "input_image",
    image_url: initialScreenshot,
    detail: "original",
  },
  ```

**Browser Tools (packages/openai/src/tools/browserTools.ts):**
- Line 43: Tool description mentions "Returns structured data extracted from the page plus screenshots"
- Lines 122, 133: Screenshots are returned in response data
- Line 176: Screenshots array initialized (empty array fallback)
- No explicit detail level configuration found in browserTools.ts — detail level is controlled by CUA worker

**Status:** ✅ **PASS** — All screenshot detail levels are correctly set to `"original"` in the CUA worker (both type definition and runtime usage). This provides full fidelity screenshots to the model for precise UI interaction.

---

## Responses API vs Chat Completions (Pattern 39)

### Findings

**Source Code Audit (packages/, apps/, infra/):**
- No legacy `client.chat.completions` API calls found in source code
- No `ChatCompletion` or `ChatCompletionMessage` types used in source code

**Responses API Usage (VERIFIED):**
- `packages/openai/src/responses.ts` (line 66, 70): OpenAI client initialized with `new OpenAI({ apiKey, maxRetries })`
- `packages/openai/src/responses.ts` (line 28-40): Type definitions use `OpenAI.Responses.ResponseCreateParams` throughout
- `packages/openai/src/responses.ts` (line 76-81): Output extracted via `response.output_text` (Responses API format)
- `packages/openai/src/shell.ts`: Calls `client.responses.create()` for structured output
- `packages/openai/src/agentos/tools/selfRepair.ts`: Calls `client.responses.create()` for self-repair loops
- `infra/cua-worker/src/responses-loop.ts` (line 368): Main loop comments: "Call Responses API (GA format: input, not messages)"

**Build Artifacts Note:**
- `.next/` and other build directories contain bundled/minified OpenAI SDK code (referenced in initial grep output)
- These are transpiled artifacts and do not represent source-level API usage patterns

**Status:** ✅ **PASS** — All active API usage is via OpenAI Responses API (`client.responses.create()`). Zero legacy Chat Completions API calls in source code. Codebase is fully migrated and consistent.

---

## Recommendations

1. **Pattern 47 (Screenshot Detail):** No changes required. `detail: "original"` is correctly used globally.
2. **Pattern 39 (Responses API):** No changes required. All source code uses Responses API exclusively.
3. **Maintenance:** Document in CLAUDE.md that both patterns have been verified and are in compliance (audit date: 2026-03-27).

**Last Verified:** 2026-03-27
